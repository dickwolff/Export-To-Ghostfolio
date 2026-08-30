import dayjs from "dayjs";
import { parse } from "csv-parse";
import { DeGiroRecord } from "../models/degiroRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class DeGiroConverterV3 extends AbstractConverter {

  constructor(securityService: SecurityService) {
    super(securityService);

    dayjs.extend(customParseFormat);
  }

  /**
   * @inheritdoc
   */
  public processFileContents(input: string, successCallback: any, errorCallback: any): void {

    // Parse the CSV and convert to Ghostfolio import format.
    parse(input, {
      delimiter: ",",
      fromLine: 2,
      columns: this.processHeaders(input),
      cast: (columnValue, context) => {

        // Custom mapping below.

        if (context.column === "currency" && columnValue === "GBX") {
          return "GBp";
        }

        return columnValue;
      }
    }, async (err, records: DeGiroRecord[]) => {

      try {

        // Check if parsing failed..
        if (err || records === undefined || records.length === 0) {
          let errorMsg = "An error occurred while parsing!";

          if (err) {
            errorMsg += ` Details: ${err.message}`

            // Temporary error check for Transactions.csv
            if (err.message.indexOf("length is 12, got 19")) {
              console.warn("[i] Detecting wrong input format. Have you exported the correct CSV file?");
              console.warn("[i] Export to Ghostfolio only supports Account.csv, not Transactions.csv!");
              console.warn("[i] See the export instructions in the README at https://git.new/JjA86vv");
            }
          }

          return errorCallback(new Error(errorMsg))
        }

        console.log("[i] Read CSV file. Start processing..");
        const result: GhostfolioExport = {
          meta: {
            date: new Date(),
            version: "v0"
          },
          activities: []
        };

        // Populate the progress bar.
        const bar1 = this.progress.create(records.length, 0);

        for (let idx = 0; idx < records.length; idx++) {
          const record = records[idx];

          // Check if the record should be ignored. 
          if (this.isIgnoredRecord(record)) {
            bar1.increment();
            continue;
          }

          // Look if the current record was already processed previously by checking the orderId.
          // Not all exports provide an order ID, so check for a buy/sell marking in those cases.
          // Dividend records never have an order ID, so check for a marking there.
          // If a match was found, skip the record and move next.
          if (result.activities.findIndex(a =>
            a.comment !== null &&
            a.comment !== "" &&
            (
              a.comment === record.orderId ||
              a.comment.startsWith(`Buy ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Sell ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Dividend ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Split-sell ${record.isin} @ ${record.date}T`) ||
              a.comment.startsWith(`Split-buy ${record.isin} @ ${record.date}T`))
          ) > -1) {

            bar1.increment();
            continue;
          }

          // TODO: Is is possible to add currency? So VWRL.AS is retrieved for IE00B3RBWM25 instead of VWRL.L.
          // Maybe add yahoo-finance2 library that Ghostfolio uses, so I dont need to call Ghostfolio for this.

          // Platform fees do not have a security, add those immediately.
          if (this.isPlatformFees(record)) {

            const feeAmount = Math.abs(parseFloat(record.amount.replace(",", ".")));
            const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

            result.activities.push({
              accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
              comment: null,
              fee: feeAmount,
              quantity: 1,
              type: GhostfolioOrderType.fee,
              unitPrice: 0,
              currency: record.currency,
              dataSource: "MANUAL",
              date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
              symbol: record.description,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Stock splits ('Ajustement fractionnement') come as two rows sharing date+ISIN+time,
          // one debit (+N post-split shares) and one credit (-M pre-split shares). Ghostfolio has
          // no split activity type; represent it as SELL M @ oldPx + BUY N @ newPx (cash-neutral,
          // cost basis preserved, share count correct).
          if (this.isStockSplitRecord(record)) {
            const sibling = this.findSplitSibling(record, records.slice(idx + 1));
            if (sibling) {
              // Look up security using this record's currency (both legs share currency).
              let splitSecurity: YahooFinanceRecord;
              try {
                splitSecurity = await this.securityService.getSecurity(
                  record.isin, null, record.product, record.currency, this.progress);
              } catch (err) {
                this.logQueryError(record.isin || record.product, idx);
                return errorCallback(err);
              }
              if (!splitSecurity) {
                this.progress.log(`[i] No result found for ${record.isin || record.product} with currency ${record.currency}! Please add this manually..\n`);
                bar1.increment(2);
                continue;
              }
              const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");
              // Debit row has negative amount, credit row has positive.
              const debitRow = parseFloat(record.amount.replace(/\s/g, "").replace(",", ".")) < 0 ? record : sibling;
              const creditRow = debitRow === record ? sibling : record;
              const debitParsed = this.parseSplitDescription(debitRow.description);
              const creditParsed = this.parseSplitDescription(creditRow.description);
              if (debitParsed && creditParsed) {
                // Debit shares = post-split (added), credit shares = pre-split (removed).
                // (In DeGiro FR: debit side has the higher qty and lower price; credit side the opposite.)
                const postSplitQty = debitParsed.qty;
                const postSplitPx = debitParsed.px;
                const preSplitQty = creditParsed.qty;
                const preSplitPx = creditParsed.px;

                // SELL pre-split holding.
                result.activities.push({
                  accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                  comment: `Split-sell ${record.isin} @ ${record.date}T${record.time}`,
                  fee: 0,
                  quantity: preSplitQty,
                  type: GhostfolioOrderType.sell,
                  unitPrice: preSplitPx,
                  currency: record.currency,
                  dataSource: "YAHOO",
                  date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                  symbol: splitSecurity.symbol,
                  tags: getTags()
                });
                // BUY post-split holding.
                result.activities.push({
                  accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                  comment: `Split-buy ${record.isin} @ ${record.date}T${record.time}`,
                  fee: 0,
                  quantity: postSplitQty,
                  type: GhostfolioOrderType.buy,
                  unitPrice: postSplitPx,
                  currency: record.currency,
                  dataSource: "YAHOO",
                  date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                  symbol: splitSecurity.symbol,
                  tags: getTags()
                });
                bar1.increment(2);
                continue;
              }
            }
          }

          // Interest does not have a security, add it immediately.
          if (this.isInterest(record)) {
            const interestAmount = Math.abs(parseFloat(record.amount.replace(",", ".")));
            const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

            result.activities.push({
              accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
              comment: null,
              fee: 0,
              quantity: 1,
              type: GhostfolioOrderType.interest,
              unitPrice: interestAmount,
              currency: record.currency,
              dataSource: "MANUAL",
              date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
              symbol: record.description,
              tags: getTags()
            });

            bar1.increment(1);
            continue;
          }

          // Look for the security for the current record.
          let security: YahooFinanceRecord;
          try {
            security = await this.securityService.getSecurity(
              record.isin,
              null,
              record.product,
              record.currency,
              this.progress);
          }
          catch (err) {
            this.logQueryError(record.isin || record.product, idx);
            return errorCallback(err);
          }

          // Log whenever there was no match found.
          if (!security) {
            this.progress.log(`[i] No result found for ${record.isin || record.product} with currency ${record.currency}! Please add this manually..\n`);
            bar1.increment();
            continue;
          }

          // Look ahead in the remaining records if there is one with the samen orderId.
          let matchingRecord = this.findMatchByOrderId(record, records.slice(idx + 1));

          // If there was no match by orderId, and there was no orderId present on the current record, look ahead in the remaining records to find a match by ISIN + Product.
          if (!matchingRecord && !record.orderId) {
            matchingRecord = this.findMatchByIsin(record, records.slice(idx + 1));
          }

          // If it's a standalone record, add it immediately.
          if (!matchingRecord) {

            if (this.isBuyOrSellRecord(record)) {
              result.activities.push(this.mapRecordToActivity(record, security));
            }
            else {
              result.activities.push(this.mapDividendRecord(record, null, security));
            }
          }
          else {

            // This is a pair of records. Check which type of record it is and then combine the records into a Ghostfolio activity.

            // Check wether it is a buy/sell record set.
            if (this.isBuyOrSellRecordSet(record, matchingRecord)) {
              result.activities.push(this.combineRecords(record, matchingRecord, security));
            } else {
              result.activities.push(this.mapDividendRecord(record, matchingRecord, security));
            }
          }

          bar1.increment();
        }

        this.progress.stop();

        successCallback(result);
      }
      catch (error) {
        console.log("[e] An error occurred while processing the file contents. Stack trace:");
        console.log(error.stack);
        this.progress.stop();
        errorCallback(error);
      }
    });
  }

  /**
   * @inheritdoc
   */
  protected processHeaders(_: string): string[] {

    // Generic header mapping from the DEGIRO CSV export.
    const csvHeaders = [
      "date",
      "time",
      "currencyDate",
      "product",
      "isin",
      "description",
      "fx",
      "currency",
      "amount",
      "col1", // Not relevant column.
      "col2", // Not relevant column.
      "orderId"];

    return csvHeaders;
  }

  /**
   * @inheritdoc
   */
  public isIgnoredRecord(record: DeGiroRecord): boolean {

    if (record.description === "") {
      return true;
    }

    // Record without date/time/product/isin should also be ignored.
    if (!record.date && !record.time && !record.product && !record.isin) {
      return true;
    }

    const ignoredRecordTypes = [
      "ideal",
      "flatex",
      "cash sweep",
      "withdrawal",
      "productwijziging",
      "währungswechsel",
      "trasferisci",
      "deposito",
      "credito",
      "credit",
      "prelievo",
      "creditering",
      "debitering",
      "rente",
      "interesse",
      "verrekening promotie",
      "operation de change",
      "versement de fonds",
      "débit",
      "debit",
      "depósito",
      "ingreso",
      "retirada",
      "levantamento de divisa",
      "dito de divisa",
      "fonds monétaires"];

    return ignoredRecordTypes.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private findMatchByOrderId(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    return records.find(r => r.orderId === currentRecord.orderId
      && dayjs(r.date).isSame(dayjs(currentRecord.date), 'day')
      && !this.isIgnoredRecord(r)
    );
  }

  private findMatchByIsin(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    return records.find(r => r.isin === currentRecord.isin && r.product === currentRecord.product);
  }

  private mapRecordToActivity(record: DeGiroRecord, security?: YahooFinanceRecord, isTransactionFeeRecord: boolean = false): GhostfolioActivity {

    let numberShares, unitPrice, feeAmount = 0;
    let orderType;

    // If it is not a transaction fee record, get data from the record.
    if (!isTransactionFeeRecord) {

      // Get the amount of shares from the description.
      const numberSharesFromDescription = record.description.match(/([\d*\.?\,?\d*]+)/)[0];
      numberShares = parseFloat(numberSharesFromDescription);

      // For buy/sale records, only the total amount is recorded. So the unit price needs to be calculated.
      const totalAmount = parseFloat(record.amount.replace(",", "."));
      unitPrice = parseFloat((Math.abs(totalAmount) / numberShares).toFixed(3));

      // If amount is negative (so money has been removed) or it's stock dividend (so free shares), thus it's a buy record.
      if (totalAmount < 0 || record.description.toLocaleLowerCase().indexOf("stock dividend") > -1) {
        orderType = GhostfolioOrderType.buy;
      } else {
        orderType = GhostfolioOrderType.sell;
      }
    }
    else {

      // Otherwise, get the transaction fee info.
      feeAmount = parseFloat(Math.abs(parseFloat(record.amount.replace(",", "."))).toFixed(3));
    }

    const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: record.orderId ?? `${orderType === GhostfolioOrderType.buy ? "Buy" : "Sell"} ${record.isin} @ ${record.date}T${record.time}`,
      fee: feeAmount,
      quantity: numberShares,
      type: orderType,
      unitPrice: unitPrice,
      currency: record.currency ?? "",
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol ?? "",
      tags: getTags()
    };
  }

  private combineRecords(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord, security: YahooFinanceRecord): GhostfolioActivity {

    // Set the default values for the records.
    let actionRecord = currentRecord;
    let txFeeRecord: DeGiroRecord | null = nextRecord;

    // Determine which of the two records is the action record (e.g. buy/sell) and which contains the transaction fees.
    // Firstly, check if the current record is the TxFee record.
    if (this.isTransactionFeeRecord(currentRecord, true)) {
      actionRecord = nextRecord;
      txFeeRecord = currentRecord;
    }

    // Map both records.
    const mappedActionRecord = this.mapRecordToActivity(actionRecord, security);
    const mappedTxFeeRecord = this.mapRecordToActivity(txFeeRecord, security, true);

    // Extract the fee from the transaction fee record and put it in the action record.
    mappedActionRecord.fee = mappedTxFeeRecord.fee;

    return mappedActionRecord;
  }

  private mapDividendRecord(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord | null = null, security: YahooFinanceRecord): GhostfolioActivity {

    // It's a dividend set.
    // Set the default values for the records.
    let dividendRecord = currentRecord;
    let txFeeRecord: DeGiroRecord = nextRecord;

    // Determine which of the two records is the dividend record and which contains the transaction fees.
    // Firstly, check if the current record is the TxFee record.
    if (nextRecord && this.isTransactionFeeRecord(currentRecord, false)) {
      dividendRecord = nextRecord;
      txFeeRecord = currentRecord;
    }

    let unitPrice = Math.abs(parseFloat(dividendRecord.amount.replace(",", ".")));
    let fees = 0;
    if (txFeeRecord) {
      fees = Math.abs(parseFloat(txFeeRecord.amount.replace(",", ".")));
    }

    const date = dayjs(`${dividendRecord.date} ${dividendRecord.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: `Dividend ${dividendRecord.isin} @ ${currentRecord.date}T${currentRecord.time}`,
      fee: fees,
      quantity: 1,
      type: GhostfolioOrderType.dividend,
      unitPrice: unitPrice,
      currency: dividendRecord.currency,
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol,
      tags: getTags()
    };
  }

  private isBuyOrSellRecordSet(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord): boolean {
    return (this.isBuyOrSellRecord(currentRecord) && this.isTransactionFeeRecord(nextRecord, true)) ||
      (this.isTransactionFeeRecord(currentRecord, true) && this.isBuyOrSellRecord(nextRecord))
  }

  private isBuyOrSellRecord(record: DeGiroRecord): boolean {

    if (!record) {
      return false;
    }

    const buySellRecordType = ["\@", "zu je"]//, "acquisto"];

    return buySellRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isTransactionFeeRecord(record: DeGiroRecord, isBuyOrSellTransactionFeeRecord: boolean): boolean {

    if (!record) {
      return false;
    }

    // When a dividend transaction must be found, there should not be an orderid.
    if (!isBuyOrSellTransactionFeeRecord && record.orderId) {
      return false;
    }

    const transactionFeeRecordType = ["en\/of", "and\/or", "und\/oder", "e\/o", "adr\/gdr", "ritenuta", "belasting", "daň z dividendy", "taxe sur les", "impôts sur", "comissões de transação", "courtage et/ou"];

    return transactionFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isPlatformFees(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["aansluitingskosten", "connection fee", "costi di connessione", "verbindungskosten", "custo de conectividade", "frais de connexion", "juros", "corporate action"];

    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isInterest(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["degiro courtesy"];

    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isStockSplitRecord(record: DeGiroRecord): boolean {
    if (!record || !record.description) return false;
    const stockSplitMarkers = ["ajustement fractionnement", "stock split", "aktiensplit", "frazionamento"];
    return stockSplitMarkers.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private findSplitSibling(record: DeGiroRecord, remaining: DeGiroRecord[]): DeGiroRecord | null {
    return remaining.find(r =>
      r.isin === record.isin &&
      r.date === record.date &&
      r.time === record.time &&
      this.isStockSplitRecord(r)) || null;
  }

  private parseSplitDescription(description: string): { qty: number; px: number } | null {
    // Match: "Ajustement fractionnement: 30 NVIDIA Corporation @ 120,888 USD (US67066G1040)"
    // Also:  "Ajustement fractionnement: 3 NVIDIA Corporation @ 1 208,88 USD (US67066G1040)"
    // Quantity is the first integer, price is the number after '@' (allowing thin/regular spaces
    // as thousands separators and comma as decimal separator).
    const m = description.match(/:\s*([0-9]+)\s.+@\s*([0-9\s\u00A0.,]+?)\s+[A-Z]{3}/);
    if (!m) return null;
    const qty = parseInt(m[1], 10);
    const pxStr = m[2].replace(/[\s\u00A0]/g, "").replace(",", ".");
    const px = parseFloat(pxStr);
    if (isNaN(qty) || isNaN(px)) return null;
    return { qty, px };
  }
}
