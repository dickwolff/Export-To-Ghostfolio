import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { GhostfolioExport } from "../../models/ghostfolioExport";
import { IConverter } from "./iconverter";
import { GhostfolioOrderType } from "../../models/ghostfolioOrderType";
import { Trading212Record } from "../../models/trading212Record";
import * as cliProgress from "cli-progress";
import { GhostfolioService } from "../ghostfolioService";

export class Trading212Converter implements IConverter {

    private ghostfolioService: GhostfolioService;
    private progress: cliProgress.MultiBar;

    constructor() {

        this.ghostfolioService = new GhostfolioService();
        this.progress = new cliProgress.MultiBar({ stopOnComplete: true, forceRedraw: true }, cliProgress.Presets.shades_classic);
    }

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

                let ticker: any;
                try { ticker = await this.ghostfolioService.getTicker(record, this.progress); }
                catch (err) {
                    errorExport = true;
                    break;
                }

                // Log whenever there was no match found.
                if (!ticker) {
                    throw new Error(`Could not find a match for ${record.action} action for ${record.ticker} (index ${idx}) with currency ${record.currencyPriceShare}..`);
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
                    symbol: ticker.symbol
                });

                bar1.increment();
            }

            this.progress.stop()

            callback(result);
        });
    }

    private processHeaders(csvFile: string): string[] {

        const csvHeaders = [];

        // Get header line and split in columns.
        const firstLine = csvFile.split('\n')[0];
        const colsInFile = firstLine.split(',');

        for (let idx = 0; idx <= colsInFile.length; idx++) {

            // Ignore empty columns.
            if (!colsInFile[idx]) {
                continue;
            }
            // Replace all charachters except a-z, and camelCase the string.
            let col: string = this.camelize(colsInFile[idx]);

            // Manual polishing..
            if (col === "iSIN") {
                col = col.toLocaleLowerCase();
            } else if (col.endsWith("EUR")) {
                col = col.slice(0, -3) + "Eur";
            }

            csvHeaders.push(col);
        }

        return csvHeaders;
    }

    private camelize(str): string {
        return str.replace(/[^a-zA-Z ]/g, "").replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }
}
