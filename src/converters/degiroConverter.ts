import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { DeGiroRecord } from "../models/degiroRecord";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class DeGiroConverter extends AbstractConverter {

  private yahooFinanceService: YahooFinanceService;

  constructor() {
    super();

    this.yahooFinanceService = new YahooFinanceService();
  }

  /**
   * @inheritdoc
   */
  public processFile(inputFile: string, callback: any): void {

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

      console.log(`Read CSV file ${inputFile}. Start processing..`);
      const result: GhostfolioExport = {
        meta: {
          date: new Date(),
          version: "v0"
        },
        activities: []
      }

      // Populate the progress bar.
      const bar1 = this.progress.create(records.length, 0);

      for (let idx = 0; idx < records.length; idx++) {
        const record = records[idx];
        
        const description = record.description.toLocaleLowerCase();

        // Skip some records which contains one of the words below.
        if (description === "" ||
          description.indexOf("ideal") > -1 ||
          description.indexOf("flatex") > -1 ||
          description.indexOf("cash sweep") > -1 ||
          description.indexOf("withdrawal") > -1 ||
          description.indexOf("pass-through") > -1) {
          continue;
        }

        // Skip all remaining records where:
        // - The description does not contain the text 'dividend', and
        // - The description does not contain an '@' (present on buy/sell records), and
        // - The description does not contain an '/' (present on buy/sell fee records).
        if (description.indexOf("dividend") === -1 && description.indexOf("\@") === -1 && description.indexOf("\/") === -1) {
          continue;
        }

        // TODO: Is is possible to add currency? So VWRL.AS is retrieved for IE00B3RBWM25 instead of VWRL.L.
        // Maybe add yahoo-finance2 library that Ghostfolio uses, so I dont need to call Ghostfolio for this.

        let security: YahooFinanceRecord;
        try {
          security = await this.yahooFinanceService.getSecurity(
            record.isin,
            null,
            null,
            record.currency,
            this.progress);
        }
        catch {
          break;
        }

        let orderType: GhostfolioOrderType;
        let fees, unitPrice, numberShares;
        fees = unitPrice = numberShares = 0;
        let marker = "";

        // Retrieve relevant data for a dividend record.
        if (description.indexOf("dividend") > -1) {

          // Retrieve the amount of the record. Check wether this is negative. If so, this is a dividend tax record.
          // Dividend tax references to the previous record. This is always a "dividend" record.
          const amountRecord = parseFloat(record.amount.replace(",", "."));
          if (amountRecord < 0) {

            // Retrieve the data from this record and place it on the previous processed record.
            // This record should not be added, so it will be skipped after retrieving the required info.

            // Get absolute dividend tax amount.
            unitPrice = Math.abs(amountRecord);

            // Set record values.
            result.activities[result.activities.length - 1].fee = unitPrice;
            result.activities[result.activities.length - 1].currency = record.currency;
            result.activities[result.activities.length - 1].comment = "";

            continue;
          }

          // This is just a normal dividend record.
          numberShares = 1;
          orderType = GhostfolioOrderType.dividend;
          unitPrice = Math.abs(parseFloat(record.amount.replace(",", ".")));
        }

        // Check for a buy/sell record. This can be identified by an '@'.
        if (description.match(/\@/)) {

          // Get the amount of shares from the description.
          const numberSharesFromDescription = description.match(/([\d*\.?\,?\d*]+)/)[0];
          numberShares = parseFloat(numberSharesFromDescription);

          // For buy/sale records, only the total amount is recorded. So the unit price needs to be calculated.        
          const totalAmount = parseFloat(record.amount.replace(",", "."));
          unitPrice = parseFloat((Math.abs(totalAmount) / numberShares).toFixed(3));

          // If amount is negative, so money has been removed, thus it's a buy record.
          if (totalAmount < 0) {

            orderType = GhostfolioOrderType.buy;

            // For a Buy record, the preceding record should be "txfees". This means the buy had a transaction fee associated.
            if (result.activities[result.activities.length - 1].comment === "txfees") {

              // Set the buy transaction data.
              result.activities[result.activities.length - 1].type = orderType;
              result.activities[result.activities.length - 1].symbol = security.symbol;
              result.activities[result.activities.length - 1].quantity = numberShares;
              result.activities[result.activities.length - 1].unitPrice = unitPrice;
              result.activities[result.activities.length - 1].currency = record.currency;
              result.activities[result.activities.length - 1].comment = "";

              continue;
            } else {

              // It is a buy transaction without fees (e.g. within Kernselectie).
              // This is only for support of older transactions before June 1st 2023, since the Kernselectie is no longer without fees.
              marker = "";
            }
          } else {

            // Amount is positive, so money is received, thus it's a sell record.                    
            orderType = GhostfolioOrderType.sell;

            // For a Sale record, the preceding record should be "txfees". This means the sale had a transaction fee associated.
            if (result.activities[result.activities.length - 1].comment === "txfees") {
              result.activities[result.activities.length - 1].type = orderType;
              result.activities[result.activities.length - 1].symbol = security.symbol;
              result.activities[result.activities.length - 1].quantity = numberShares;
              result.activities[result.activities.length - 1].unitPrice = unitPrice;
              result.activities[result.activities.length - 1].currency = record.currency;
              result.activities[result.activities.length - 1].comment = "";

              continue;
            }
          }
        }

        // Ghostfolio validation doesn't allow empty order types.
        if (!orderType) {
          continue;
        }

        // When ISIN is given, check for transaction fees record.
        // For this record the "Amount" record should be retrieved. This contains the transaction fee in local currency.
        if (record.isin.length > 0) {
          const creditMatch = description.match(/(en\/of)|(and\/or)|(und\/oder)|(e\/o)/);
          if (creditMatch) {
            fees = Math.abs(parseFloat(record.amount.replace(",", ".")));
            marker = "txfees";
          }
        } else {
          
          // If ISIN is not set, the record is not relevant.
          continue;
        }

        const date = dayjs(`${record.date} ${record.time}:00`, "DD-MM-YYYY HH:mm");
    
        // Log whenever there was no match found.
        if (!security) {
          throw new Error(`Could not find a match for ${orderType} action for ${record.isin} (index ${idx}) with currency ${record.currency}..`);
        }

        // Add record to export.
        result.activities.push({
          accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
          comment: marker,
          fee: fees,
          quantity: numberShares,
          type: orderType,
          unitPrice: unitPrice,
          currency: record.currency,
          dataSource: "YAHOO",
          date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
          symbol: security.symbol
        });

        bar1.increment();
      }

      this.progress.stop()

      callback(result);
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
}
