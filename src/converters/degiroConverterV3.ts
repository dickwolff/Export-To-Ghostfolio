import dayjs from "dayjs";
import * as crypto from "crypto";
import { parse } from "csv-parse";
import { DeGiroRecord } from "../models/degiroRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class DeGiroConverterV3 extends AbstractConverter {

  constructor(securityService: SecurityService) {
    super(securityService);

    dayjs.extend(customParseFormat);
  }

  /**
   * @inheritdoc
   */
  public processFileContents(input: string, successCallback: any, errorCallback: any): void {
    // my exported file contained many broken records like this. It's easy to recover them. So, why not?!
    // 13-04-2016,09:00,13-04-2016,ABN AMRO BANK NV,NL0011540547,"Koop 10 @ 18,3 EUR",,EUR,-183.00,EUR,,df134e52-2753-4694-
    // ,,,,,,,,,,,947b-418f08d4a352
    input = input.replace(/(,[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-)\n,{11}([a-f0-9]{4}-[a-f0-9]{12})$/mg, '$1$2');

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
    }, async (err, plainRecords: DeGiroRecord[]) => {

      // Check if parsing failed..
      if (err || plainRecords === undefined || plainRecords.length === 0) {
        let errorMsg = "An error ocurred while parsing!";

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

      // Map plain objects to DeGiroRecord instances
      const records = plainRecords.map(record => DeGiroRecord.fromPlainObject(record));

      // Populate the progress bar.
      const bar1 = this.progress.create(records.length, 0);

      // HashSet to skip processed records
      const processedRecords = new Set<string>();

      for (let idx = 0; idx < records.length; idx++) {
        const record = records[idx];

        // Check if the record should be ignored. 
        if (this.isIgnoredRecord(record)) {
          bar1.increment();
          continue;
        }

        // Check if the current record was already processed.
        const recordHash = this.hashRecord(record);
        if (processedRecords.has(recordHash)) {
            bar1.increment();
            continue
        }

        processedRecords.add(recordHash);

        // TODO: Is is possible to add currency? So VWRL.AS is retrieved for IE00B3RBWM25 instead of VWRL.L.
        // Maybe add yahoo-finance2 library that Ghostfolio uses, so I dont need to call Ghostfolio for this.

        // Platform fees do not have a security, add those immediately.
        if (this.isPlatformFees(record)) {
          result.activities.push(this.mapPlatformFeeRecord(record));
          bar1.increment(1);
          continue;
        }

        // Interest does not have a security, add it immediately.
        if (this.isInterest(record)) {
          result.activities.push(this.mapInterestRecord(record));
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

        // Look ahead in the remaining records if there are some with the same orderId.
        let matchingRecords = [];
        if (record.orderId) {
          matchingRecords = this.findMatchesByOrderId(record, records.slice(idx + 1));
        }

        // If there was no match by orderId, and there was no orderId present on the current record, look ahead one record to find a match by ISIN + Product + Date.
        if (matchingRecords.length == 0 && !record.orderId) {
          matchingRecords = this.findMatchByIsinSameDateTime(record, records.slice(idx + 1, idx + 2));
        }

        if (matchingRecords.length > 0) {
          // Filter out ignored records
          matchingRecords = matchingRecords.filter(r => !this.isIgnoredRecord(r));

          // Register records as processed so they are skipped on next iteration(s)
          matchingRecords.forEach(r => processedRecords.add(this.hashRecord(r)));
        }

        if (matchingRecords.length > 0) {
          // This is a set of records. Check which type of record it is and then combine the records into a Ghostfolio activity.

          // Get main and fees records
          matchingRecords.unshift(record);
          const mainRecords = matchingRecords.filter(r => this.isBuyOrSellRecord(r) || this.isDividendRecord(r));
          let transactionFeeRecords = matchingRecords.filter(r => this.isTransactionFeeRecord(r));

          if (mainRecords.length == 0 || matchingRecords.length != mainRecords.length + transactionFeeRecords.length) {
            this.progress.log(`[i] Unexpected set of ${matchingRecords.length} records (see below)! Please add them manually..\n`);
            matchingRecords.forEach(r => this.progress.log(`Record ${r.isin || r.product} from ${r.date} with ${r.amount}${r.currency}`));
            bar1.increment();
            continue;
          }

          // if there is one main record, report it combined with transaction fee(s). All other goes without TX fee.
          mainRecords.forEach(r => {
            if (this.isBuyOrSellRecord(r)) {
              result.activities.push(this.combineRecords(r, transactionFeeRecords, security));
            } else {
              result.activities.push(this.mapDividendRecord(r, transactionFeeRecords, security));
            }

            transactionFeeRecords = []; // nullify tx after first iteration
          });
        } else {
          // If it's a standalone record, add it immediately.
          if (this.isBuyOrSellRecord(record)) {
            result.activities.push(this.mapRecordToActivity(record, security));
          } else if (this.isDividendRecord(record)) {
            result.activities.push(this.mapDividendRecord(record, [], security));
          } else if (this.isTransactionFeeRecord(record)) {
            // sometimes there are stantalone transaction records, report them as platform fees
            result.activities.push(this.mapPlatformFeeRecord(record));
          } else {
            this.progress.log(`[i] Unknown standalone record ${record.isin || record.product} from ${record.date} with ${record.amount}${record.currency}! Please add this manually..\n`);
          }
        }

        bar1.increment();
      }

      this.progress.stop();

      successCallback(result);
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
      "balance_currency",
      "balance",
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
      "compensatie",
      "terugstorting",
      "geldmarktfonds",
      "overboeking",
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

  private findMatchesByOrderId(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord[] | undefined {
    return records.filter(r => r.orderId === currentRecord.orderId);
  }

  private findMatchByIsinSameDateTime(currentRecord: DeGiroRecord, records: DeGiroRecord[]): DeGiroRecord[] | undefined {
    return records.filter(r => r.isin === currentRecord.isin && r.product === currentRecord.product && r.date == currentRecord.date);
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
      const totalAmount = record.getAmount();
      unitPrice = Math.abs(totalAmount) / numberShares;

      // If amount is negative (so money has been removed) or it's stock dividend (so free shares), thus it's a buy record.
      if (totalAmount < 0 || record.description.toLocaleLowerCase().indexOf("stock dividend") > -1) {
        orderType = GhostfolioOrderType.buy;
      } else {
        orderType = GhostfolioOrderType.sell;
      }
    } else {

      // Otherwise, get the transaction fee info.
      feeAmount = record.getAbsoluteAmount();
      orderType = record.getAmount() < 0 ? GhostfolioOrderType.sell : GhostfolioOrderType.buy;
      numberShares = 1;
      unitPrice = 0;
    }

    const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: record.orderId ?? `${orderType === GhostfolioOrderType.buy ? "Buy" : "Sell"} ${record.isin} @ ${record.date}T${record.time}`,
      fee: this.formatFloat(feeAmount),
      quantity: numberShares,
      type: orderType,
      unitPrice: this.formatFloat(unitPrice),
      currency: record.currency ?? "",
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol ?? "",
    };
  }

  private combineRecords(mainRecord: DeGiroRecord, transactionFeeRecords: DeGiroRecord[], security: YahooFinanceRecord): GhostfolioActivity {
    // Map both records.
    const mappedActionRecord = this.mapRecordToActivity(mainRecord, security);
    const mappedTxFeeRecords = transactionFeeRecords.map(r => this.mapRecordToActivity(r, security, true));

    // Extract the fee from the transaction fee record and put it in the action record.
    mappedActionRecord.fee = mappedTxFeeRecords.reduce((sum, r) => sum + r.fee, 0);

    return mappedActionRecord;
  }

  private mapDividendRecord(dividendRecord: DeGiroRecord, transactionFeeRecords: DeGiroRecord[], security: YahooFinanceRecord): GhostfolioActivity {
    const unitPrice = dividendRecord.getAbsoluteAmount();
    const feeAmount = transactionFeeRecords.reduce((sum, r) => sum + r.getAbsoluteAmount(), 0);
    const date = dayjs(`${dividendRecord.date} ${dividendRecord.time}:00`, "DD-MM-YYYY HH:mm");

    // Create the record.
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: `Dividend ${dividendRecord.isin} @ ${dividendRecord.date}T${dividendRecord.time}`,
      fee: this.formatFloat(feeAmount),
      quantity: 1,
      type: GhostfolioOrderType.dividend,
      unitPrice: this.formatFloat(unitPrice),
      currency: dividendRecord.currency,
      dataSource: "YAHOO",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: security.symbol,
    };
  }

  private mapPlatformFeeRecord(record: DeGiroRecord): GhostfolioActivity {
    const feeAmount = record.getAbsoluteAmount();
    const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: "",
      fee: this.formatFloat(feeAmount),
      quantity: 1,
      type: GhostfolioOrderType.fee,
      unitPrice: 0,
      currency: record.currency,
      dataSource: "MANUAL",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: record.description
    };
  }

  private mapInterestRecord(record: DeGiroRecord): GhostfolioActivity {
    const interestAmount = record.getAbsoluteAmount();
    const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");
    return {
      accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
      comment: "",
      fee: 0,
      quantity: 1,
      type: GhostfolioOrderType.interest,
      unitPrice: this.formatFloat(interestAmount),
      currency: record.currency,
      dataSource: "MANUAL",
      date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
      symbol: record.description
    };
  }

  private isBuyOrSellRecord(record: DeGiroRecord): boolean {

    if (!record) {
      return false;
    }

    const buySellRecordType = ["\@", "zu je"]//, "acquisto"];

    return buySellRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isDividendRecord(record: DeGiroRecord): boolean {

    if (!record) {
      return false;
    }

    if (this.isTransactionFeeRecord(record)) {
      // dividend tax records often has 'Impôts sur dividende' or 'dividendbelasting'
      // which make them match the condition below.
      return false;
    }

    return record.description.toLocaleLowerCase().indexOf("dividend") > -1 || record.description.toLocaleLowerCase().indexOf("capital return") > -1;
  }

  private isTransactionFeeRecord(record: DeGiroRecord): boolean {

    if (!record) {
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

  private hashRecord(record: DeGiroRecord): string {
    const md5 = crypto.createHash('md5');
    md5.update(record.date);
    md5.update(record.time);
    md5.update(record.currencyDate.toString());
    md5.update(record.product);
    md5.update(record.isin);
    md5.update(record.description);
    md5.update(record.fx);
    md5.update(record.currency);
    md5.update(record.amount);
    md5.update(record.balance_currency);
    md5.update(record.balance);
    md5.update(record.orderId);
    return md5.digest('hex');
  }

  private formatFloat(val: number): number {
    return parseFloat(val.toFixed(3));
  }
}
