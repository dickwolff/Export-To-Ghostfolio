import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { SchwabRecord } from "../models/schwabRecord";

export class SchwabConverter extends AbstractConverter {

    private yahooFinanceService: YahooFinanceService;

    constructor() {
        super();

        this.yahooFinanceService = new YahooFinanceService();
        
        dayjs.extend(customParseFormat);
    }

    /**
     * @inheritdoc
     */
    public processFile(inputFile: string, callback: any): void {

        // Read file contents of the CSV export.
        const csvFile = fs.readFileSync(inputFile, "utf-8");

        // Parse the CSV and convert to Ghostfolio import format.
        const parser = parse(csvFile, {
            delimiter: ",",
            fromLine: 2,
            columns: this.processHeaders(csvFile),
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
                    else if (action.indexOf("interest") > -1 ) {
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
                    return parseFloat(columnValue || "0");
                }

                return columnValue;
            }
        }, async (_, records: SchwabRecord[]) => {

            // If records is empty, parsing failed..
            if (records === undefined) {
                throw new Error(`An error ocurred while parsing ${inputFile}...`);
            }

            let errorExport = false;

            console.log(`[i] Read CSV file ${inputFile}. Start processing..`);
            const result: GhostfolioExport = {
                meta: {
                    date: new Date(),
                    version: "v0"
                },
                activities: []
            }

            // Populate the progress bar.
            const bar1 = this.progress.create(records.length - 1, 0);

            // Skip last line of export ( stats).
            for (let idx = 0; idx < records.length - 1; idx++) {
                const record = records[idx];

                // Skip administrative fee/deposit/withdraw transactions.
                if (record.action.toLocaleLowerCase().startsWith("wire") ||
                    record.action.toLocaleLowerCase().indexOf("credit") > -1 ||
                    record.action.toLocaleLowerCase().indexOf("journal") > -1 ||
                    record.date.toString().toLocaleLowerCase() === "transactions total") {
                    bar1.increment();
                    continue;
                }

                // Custody fees or interest do not have a security, so add those immediately.
                if (record.action.toLocaleLowerCase() === "fee" ||
                    record.action.toLocaleLowerCase() === "interest") {

                    const feeAmount = Math.abs(record.amount);

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
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.description
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        null,
                        record.symbol,
                        record.description,
                        "USD",
                        this.progress);
                }
                catch (err) {
                    errorExport = true;
                    throw err;
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i]\tNo result found for ${record.action} action for ${record.symbol || record.description} with currency USD! Please add this manually..\n`);
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
                    priceShare = record.amount;
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

            callback(result);
        });

        // Catch any error.
        parser.on('error', function (err) {
            console.log("[i] An error ocurred while processing the input file! See error below:")
            console.error("[e]", err.message);
        });
    }
}