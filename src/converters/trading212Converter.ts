import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { Trading212Record } from "../models/trading212Record";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class Trading212Converter extends AbstractConverter {

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

                // Convert actions to Ghostfolio type.
                if (context.column === "action") {
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
                if (context.column === "noOfShares" ||
                    context.column === "priceShare") {
                    return parseFloat(columnValue);
                }

                // Patch GBX currency (should be GBp).
                if (context.column === "currencyPriceShare") {
                    if (columnValue == "GBX") {
                        return "GBp";
                    }
                }

                return columnValue;
            }
        }, async (_, records: Trading212Record[]) => {

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

                // Skip deposit/withdraw transactions.
                if (record.action.toLocaleLowerCase().indexOf("deposit") > -1 ||
                    record.action.toLocaleLowerCase().indexOf("withdraw") > -1 ||
                    record.action.toLocaleLowerCase().indexOf("cash") > -1) {
                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        record.ticker,
                        record.name,
                        record.currencyPriceShare,
                        this.progress);
                }
                catch (err) {
                    errorExport = true;
                    throw err;
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`\tgetSymbol(): No result found for ${record.isin || record.ticker || record.name}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: 0,
                    quantity: record.noOfShares,
                    type: GhostfolioOrderType[record.action],
                    unitPrice: record.priceShare,
                    currency: record.currencyPriceShare,
                    dataSource: "YAHOO",
                    date: dayjs(record.time).format("YYYY-MM-DDTHH:mm:ssZ"),
                    symbol: security.symbol
                });

                bar1.increment();
            }

            this.progress.stop()

            callback(result);
        });
    }
}
