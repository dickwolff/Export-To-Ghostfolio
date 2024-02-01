import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { DeGiroRecord } from "../models/degiroRecord";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class DeGiroConverterV2 extends AbstractConverter {
  private yahooFinanceService: YahooFinanceService;

  constructor() {
    super();

    this.yahooFinanceService = new YahooFinanceService();

    dayjs.extend(customParseFormat);
  }

  /**
   * @inheritdoc
   */
  public processFileContents(inputFile: string, successCallback: any, errorCallback: any): void {

    // Read file contents of the CSV export.
    const csvFile = fs.readFileSync(inputFile, "utf-8");

    // Parse the CSV and convert to Ghostfolio import format.
    parse(csvFile, {
        delimiter: ",",
        fromLine: 2,
        columns: this.processHeaders(csvFile),
        cast: (columnValue, context) => {

          // Custom mapping below.

          return columnValue;
        }
      }, async (_, records: DeGiroRecord[]) => {

        console.log(`[i] Read CSV file ${inputFile}. Start processing..`);
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

          // TODO: Is is possible to add currency? So VWRL.AS is retrieved for IE00B3RBWM25 instead of VWRL.L.
          // Maybe add yahoo-finance2 library that Ghostfolio uses, so I dont need to call Ghostfolio for this.
            
          // Platform fees do not have a security, add those immediately.
          if (this.isPlatformFees(record)) {
          
            const feeAmount = Math.abs(parseFloat(record.amount.replace(",", ".")));
            const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");            

            result.activities.push({
              accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
              comment: "",
              fee: feeAmount,
              quantity: 1,
              type: GhostfolioOrderType.fee,
              unitPrice: feeAmount,
              currency: record.currency,
              dataSource: "MANUAL",
              date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
              symbol: record.description
            });

            bar1.increment(1);
            continue;
          }
        
          // Look for the security for the current record.
          let security: YahooFinanceRecord;
          try {
            security = await this.yahooFinanceService.getSecurity(
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

          // Look ahead to the next record if it's about the same symbol as the current record.
          // If it's not, check wether the current record is a buy/sell/dividend record (without TxFees).
          if (this.lookaheadIsSameProduct(records, record, idx) || this.isBuyOrSellRecord(record) || this.isDividendRecord(record)) {
            const combinedRecord = this.combineRecords(record, records[idx + 1], security);

            // If the records were succesfully processed, add it to result.
            if (combinedRecord) {
              
              // Add the combined record to the final result.
              result.activities.push(combinedRecord[0]);
              
              bar1.increment(combinedRecord[1]);

              // If more then 1 record needs to be skipped, do so.
              if (combinedRecord[1] > 1) {
                idx++;
              }
              
              continue;
            }
          } 
          else if (this.isTransactionFeeRecord(record)) {

            // If it was a transaction record without any other transaction connected, skip it.
            bar1.increment();
            continue;
          }
          
          bar1.increment();
          this.progress.log(`[i] Record ${record.isin || record.product} with currency ${record.currency} was skipped because it could not be matches to a valid transaction! Please add this manually..\n`);
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
    
    const ignoredRecordTypes = ["ideal", "flatex", "cash sweep", "withdrawal", "productwijziging", "währungswechsel", "trasferisci", "deposito", "credito", "prelievo", "creditering", "debitering", "rente", "interesse", "ag", "verrekening promotie"];

    return ignoredRecordTypes.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }
  
  private lookaheadIsSameProduct(records: DeGiroRecord[], currentRecord: DeGiroRecord, currentIndex: number): boolean {
    
    // Check if there are no records at all.
    if (records.length === 0) {
      return false;
    }

    // Check if this is the last item in the list.
    if (currentIndex === records.length - 1) {
      return false;
    }

    const nextRecord = records[currentIndex + 1];
    
    // Return wether both records are about the same product.
    return currentRecord.product === nextRecord.product;
  }

  private combineRecords(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord, security: YahooFinanceRecord): [GhostfolioActivity, number] {
   
    if (this.isBuyOrSellRecordSet(currentRecord, nextRecord)) {

      // Set the default values for the records.
      let actionRecord = currentRecord;
      let txFeeRecord: DeGiroRecord | null = nextRecord;

      // Determine which of the two records is the action record (e.g. buy/sell) and which contains the transaction fees.
      // Firstly, check if the current record is the TxFee record.
      if (this.isTransactionFeeRecord(currentRecord)) {
        actionRecord = nextRecord;
        txFeeRecord = currentRecord;
      } 
      // Next, check wether the next record is NOT a TxFee record. In this case, the transaction has no fees.
      else if (!this.isTransactionFeeRecord(nextRecord)) {
        txFeeRecord = null;
      }

      let numberShares, unitPrice, feeAmount = 0;
      let orderType;

      // Get the amount of shares from the description.
      const numberSharesFromDescription = actionRecord.description.match(/([\d*\.?\,?\d*]+)/)[0];
      numberShares = parseFloat(numberSharesFromDescription);

      // For buy/sale records, only the total amount is recorded. So the unit price needs to be calculated.
      const totalAmount = parseFloat(actionRecord.amount.replace(",", "."));
      unitPrice = parseFloat((Math.abs(totalAmount) / numberShares).toFixed(3));

      // If amount is negative, so money has been removed, thus it's a buy record.
      if (totalAmount < 0) {
        orderType = GhostfolioOrderType.buy;
      } else {
        orderType = GhostfolioOrderType.sell;
      }
    
      // If a TxFee record was set, parse the fee amount.
      if (txFeeRecord) {
        feeAmount = Math.abs(parseFloat(txFeeRecord.amount.replace(",", ".")));
      }
      
      const date = dayjs(`${currentRecord.date} ${currentRecord.time}:00`, "DD-MM-YYYY HH:mm");

      // Create the record.
      return [
        {
          accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
          comment: "",
          fee: feeAmount,
          quantity: numberShares,
          type: orderType,
          unitPrice: unitPrice,
          currency: actionRecord.currency,
          dataSource: "YAHOO",
          date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
          symbol: security.symbol,
        }, 
        txFeeRecord ? 2 : 1 // Skip 1 record if action record had no TxFee.
      ];
    } 
    else if (this.isDividendRecordSet(currentRecord, nextRecord)) {
    
      // Set the default values for the records.
      let dividendRecord = currentRecord;
      let txFeeRecord: DeGiroRecord | null = nextRecord;
      
      // Determine which of the two records is the dividend record and which contains the transaction fees.
      // Firstly, check if the current record is the TxFee record.
      if (this.isTransactionFeeRecord(currentRecord)) {      
        dividendRecord = nextRecord;
        txFeeRecord = currentRecord;        
      } 
      // Next, check wether the next record is NOT a TxFee record. In this case, the dividend has no fees.
      else if (!this.isTransactionFeeRecord(nextRecord)) {
        txFeeRecord = null;        
      }
      
      let unitPrice = Math.abs(parseFloat(dividendRecord.amount.replace(",", ".")));
      let fees = 0;
      if (txFeeRecord) {
        fees = Math.abs(parseFloat(txFeeRecord.amount.replace(",", ".")));      
      }

      const date = dayjs(`${dividendRecord.date} ${dividendRecord.time}:00`, "DD-MM-YYYY HH:mm");

      // Create the record.
      return [
        {
          accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
          comment: "",
          fee: fees,
          quantity: 1,
          type: GhostfolioOrderType.dividend,
          unitPrice: unitPrice,
          currency: dividendRecord.currency,
          dataSource: "YAHOO",
          date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
          symbol: security.symbol,
        },        
        txFeeRecord ? 2 : 1 // Skip 1 record if action record had no TxFee.
      ];
    }    
  }

  private isBuyOrSellRecordSet(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord): boolean {

    // Check wether the records are a buy/sell record set. This consists of:
    // - Buy/Sell + TxFee records, or
    // - TxFee + Buy/Sell records, or
    // - Buy/Sell record without TxFee.
    return (
      (this.isBuyOrSellRecord(currentRecord) && this.isTransactionFeeRecord(nextRecord)) ||
      (this.isTransactionFeeRecord(currentRecord) && this.isBuyOrSellRecord(nextRecord) ||
      (this.isBuyOrSellRecord(currentRecord) && !this.isTransactionFeeRecord(nextRecord))));
  }

  private isDividendRecordSet(currentRecord: DeGiroRecord, nextRecord: DeGiroRecord): boolean {

    // Check wether the records are a dividend record set. This consists of:
    // - Dividend + TxFee record, or
    // - TxFee + Dividend record, or
    // - Dividend record without TxFee.
    return (
      (this.isDividendRecord(currentRecord) && this.isTransactionFeeRecord(nextRecord)) ||
      (this.isTransactionFeeRecord(currentRecord) && this.isDividendRecord(nextRecord)) ||
      (this.isDividendRecord(currentRecord) && !this.isTransactionFeeRecord(nextRecord)));
  }

  private isBuyOrSellRecord(record: DeGiroRecord): boolean {
        
    const dividendRecordType = ["\@", "zu je"]//, "acquisto"];

    return dividendRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }
    
  private isDividendRecord(record: DeGiroRecord): boolean {    
    return record.description.toLocaleLowerCase().indexOf("dividend") > -1 || record.description.toLocaleLowerCase().indexOf("capital return") > -1;
  }

  private isTransactionFeeRecord(record: DeGiroRecord): boolean {
    
    const transactionFeeRecordType = ["en\/of", "and\/or", "und\/oder", "e\/o", "adr\/gdr", "ritenuta", "belasting", "daň z dividendy"];

    return transactionFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }

  private isPlatformFees(record: DeGiroRecord): boolean {

    const platformFeeRecordType = ["aansluitingskosten", "costi di connessione", "verbindungskosten"]; 
    
    return platformFeeRecordType.some((t) => record.description.toLocaleLowerCase().indexOf(t) > -1);
  }
}
