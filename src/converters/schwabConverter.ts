import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SchwabRecord } from "../models/schwabRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class SchwabConverter extends AbstractConverter {

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

                // Convert categories to Ghostfolio type.
                if (context.column === "action") {
                    const action = columnValue.toLocaleLowerCase();

                    // Schwab supports dividend reinvest.
                    // These transactions are exported as separate transactions.
                    // "Reinvest shares" actions should be interpreted as "buy".
                    if (action.indexOf("buy") > -1 ||
                        action.indexOf("reinvest shares") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("sell") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("dividend") > -1 ||
                        action.indexOf("qual") > -1 ||
                        action.endsWith("reinvest")) {
                        return "dividend";
                    }
                    else if (action.indexOf("advisor fee") > -1) {
                        return "fee";
                    }
                    else if (action.indexOf("interest") > -1) {
                        return "interest";
                    }
                }

                // Remove the dollar sign ($) from any field.
                columnValue = columnValue.replace(/\$/g, "");

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "price" ||
                    context.column === "feesCommissions" ||
                    context.column === "amount") {

                    columnValue = columnValue.replace(/\,/g, "");
                    return parseFloat(columnValue || "0");
                }

                return columnValue;
            }
        }, async (_, records: SchwabRecord[]) => {

            // If records is empty, parsing failed..
            if (records === undefined || records.length === 0) {
                return errorCallback(new Error("An error ocurred while parsing!"));
            }

            console.log("[i] Read CSV file. Start processing..");
            const result: GhostfolioExport = {
                meta: {
                    date: new Date(),
                    version: "v0"
                },
                activities: []
            }

            // Populate the progress bar.
            const bar1 = this.progress.create(records.length - 1, 0);

            // Skip last line of export (stats).
            for (let idx = 0; idx < records.length - 1; idx++) {
                const record = records[idx];

                // Skip administrative deposit/withdraw transactions.
                if (this.isIgnoredRecord(record)) {
                    bar1.increment();
                    continue;
                }

                // Custody fees or interest do not have a security, so add those immediately.
                if (record.action.toLocaleLowerCase() === "fee" ||
                    record.action.toLocaleLowerCase() === "interest") {

                    const feeAmount = Math.abs(record.amount);
                    const date = dayjs(`${record.date}`, "MM/DD/YYYY");

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.action],
                        unitPrice: feeAmount,
                        currency: "USD",
                        dataSource: "MANUAL",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.description
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        null,
                        record.symbol,
                        record.description,
                        "USD",
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.symbol || record.description, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.action} action for ${record.symbol || record.description} with currency USD! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                // Make negative numbers (on sell records) absolute.
                let numberOfShares = Math.abs(record.quantity);
                let priceShare = Math.abs(record.price);
                let feesCommissions = Math.abs(record.feesComm);

                // Dividend records have a share count of 1.
                if (record.action === "dividend") {
                    numberOfShares = 1;
                    priceShare = Math.abs(record.amount);
                }

                const date = dayjs(`${record.date}`, "MM/DD/YYYY");

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: feesCommissions,
                    quantity: numberOfShares,
                    type: GhostfolioOrderType[record.action],
                    unitPrice: priceShare,
                    currency: "USD",
                    dataSource: "YAHOO",
                    date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                    symbol: security.symbol
                });

                bar1.increment();
            }

            this.progress.stop()

            successCallback(result);
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: SchwabRecord): boolean {

      if (record.description === "" || record.action.toLocaleLowerCase().startsWith("wire")) {
        return true;
      }

      const ignoredRecordTypes = ["credit", "journal"];

      let ignore = ignoredRecordTypes.some(t => record.action.toLocaleLowerCase().indexOf(t) > -1);

      if (!ignore) {
        ignore = record.date.toString().toLocaleLowerCase() === "transactions total";
      }

      return ignore;
    }
}
