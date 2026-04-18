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

        // Warnings collected during the loop; printed after the progress bar stops
        // so they are not erased by the bar's terminal redraws.
        const warnings: string[] = [];

        // Pre-scan: detect orders with multiple buy/sell fills (partial-fill orders).
        // DEGIRO places the fee row before all fill rows for such orders. The main loop's
        // duplicate-skip guard blocks fills 2-N after the fee is paired with fill 1.
        // We detect this here so the user knows which quantities to verify manually.
        const fillsByOrderId = new Map<string, DeGiroRecord[]>();
        for (const r of records) {
          if (r.orderId && this.isBuyOrSellRecord(r) && !this.isIgnoredRecord(r)) {
            if (!fillsByOrderId.has(r.orderId)) fillsByOrderId.set(r.orderId, []);
            fillsByOrderId.get(r.orderId).push(r);
          }
        }
        for (const [orderId, fills] of fillsByOrderId) {
          if (fills.length > 1) {
            const firstFillQty = this.parseQuantityFromDescription(fills[0].description);
            const totalQty = fills.reduce((sum, r) => {
              return sum + this.parseQuantityFromDescription(r.description);
            }, 0);
            const remainingQty = totalQty - firstFillQty;
            const missingFillDetails = fills
              .slice(1)
              .map((r) => {
                const qty = this.parseQuantityFromDescription(r.description);
                return `${qty} (${r.description})`;
              })
              .join(" | ");

            warnings.push(`[w] Order ${orderId} (${fills[0].isin}, ${fills[0].date}) has ${fills.length} fills. EXPORTED: ${firstFillQty} shares (with fee). MISSING: ${remainingQty} shares (${fills.length - 1} fill${fills.length > 2 ? 's' : ''}) — add manually in Ghostfolio. DETAILS: ${missingFillDetails}`);
          }
        }

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
              a.comment.startsWith(`Dividend ${record.isin} @ ${record.date}T`))
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

          // Look ahead in the remaining records if there is one with the same orderId.
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

        // Print any warnings collected during processing.
        for (const w of warnings) {
          console.warn(w);
        }

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
      "depozyt",
      "depósito",
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
      "ingreso",
      "retirada",
      "levantamento de divisa",
      "dito de divisa",
      "fonds monétaires",
      // Polish terms
      "przelew",
      "wpłata",
      "wypłata",
      "opłata abonamentu",
      "zmiana produktu",
      // FX records - these are paired with trade records and should be ignored
      "fx credit",
      "fx withdrawal",
      "hong kong stamp duty"
    ];

    return ignoredRecordTypes.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private findMatchByOrderId(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord | undefined {
    const candidates = records.filter(r => r.orderId === currentRecord.orderId
      && r.date === currentRecord.date
      && !this.isIgnoredRecord(r)
    );

    // When the current record is a buy/sell fill, look for the transaction-fee record only.
    // Pairing fill+fill would cause the second fill to be misclassified as a dividend.
    if (this.isBuyOrSellRecord(currentRecord)) {
      const feeMatch = candidates.find(r => this.isTransactionFeeRecord(r, true));

      return feeMatch;
    }

    // When the current record is a fee, look for the buy/sell record.
    // Prefer a buy/sell record over a transaction-fee record so that
    // fee+buy pairs are not confused with fee+tax pairs (e.g. "Francuski podatek od transakcji").
    return candidates.find(r => this.isBuyOrSellRecord(r)) ?? candidates[0];
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
      numberShares = this.parseQuantityFromDescription(record.description);

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

  /**
   * Parses the share quantity from a DEGIRO description string.
   *
   * DEGIRO descriptions follow the pattern "<action> <qty> <name>@<unitPrice> <currency>".
   * The quantity is always an integer and may use a locale-specific thousands separator:
   *   - space  (Polish/French):  "Kupno 1 250 iShares..."
   *   - dot    (German/Italian): "Kauf 1.250 iShares..."
   *   - comma  (English):        "Buy 1,250 iShares..."
   *   - none:                    "Buy 600 iShares..."
   *
   * To avoid confusing the unit price (e.g. "at 2,888 EUR") with the quantity, only the
   * portion of the description before the first "@" is examined.
   * A thousands separator is recognised only when it is followed by exactly three digits,
   * which rules out decimal separators such as "2.97" or "2,888".
   */
  private parseQuantityFromDescription(description: string): number {
    const beforeAt = description.split("@")[0];

    // Match: 1-3 leading digits + one or more groups of
    // (space|dot|comma|NBSP|narrow NBSP + exactly 3 digits)
    // This handles all locale thousands-separator variants while ignoring decimal separators.
    const withSeparator = beforeAt.match(/(\d{1,3}(?:[,. \u00A0\u202F]\d{3})+)/);
    if (withSeparator) {
      return parseInt(withSeparator[0].replace(/[,. \u00A0\u202F]/g, ""), 10);
    }

    // Fallback: plain integer (no separator).
    const plain = beforeAt.match(/(\d+)/);
    return plain ? parseInt(plain[0], 10) : 0;
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

    const transactionFeeRecordType = [
      "en\/of",
      "and\/or",
      "und\/oder",
      "e\/o",
      "adr\/gdr",
      "i\/lub",
      "ritenuta",
      "belasting",
      "daň z dividendy",
      "taxe sur les",
      "impôts sur",
      "comissões de transação",
      "courtage et/ou",
      "stamp duty",
      "opłata transakcyjna",
      "podatek dywidendowy",
      "francuski podatek od transakcji"
    ];

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
}
