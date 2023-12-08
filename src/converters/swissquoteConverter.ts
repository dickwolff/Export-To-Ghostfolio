import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { SwissquoteRecord } from "../models/swissquoteRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";

export class SwissquoteConverter extends AbstractConverter {

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
        parse(csvFile, {
            delimiter: ";",
            fromLine: 2,
            columns: this.processHeaders(csvFile, ";"),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert categories to Ghostfolio type.
                if (context.column === "transaction") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("buy") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("sell") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("dividend") > -1) {
                        return "dividend";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "unitPrice" ||
                    context.column === "costs") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (_, records: SwissquoteRecord[]) => {

            let errorExport = false;

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

                // Skip administrative fee/deposit/withdraw transactions.
                if (record.transaction.toLocaleLowerCase().indexOf("credit") > -1 ||
                    record.transaction.toLocaleLowerCase().indexOf("debit") > -1 ||
                    record.transaction.toLocaleLowerCase().indexOf("fees") > -1 ||
                    record.transaction.toLocaleLowerCase().indexOf("payment") > -1 ||
                    record.transaction.toLocaleLowerCase().indexOf("interest") > -1) {
                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        record.symbol,
                        record.name,
                        record.currency,
                        this.progress);
                }
                catch (err) {
                    errorExport = true;
                    throw err;
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`\tNo result found for ${record.transaction} action for ${record.isin || record.symbol || record.name} with currency ${record.currency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                const date = dayjs(`${record.date}`, "DD-MM-YYYY HH:mm");
                
                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: record.costs,
                    quantity: record.quantity,
                    type: GhostfolioOrderType[record.transaction],
                    unitPrice: record.unitPrice,
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
}
