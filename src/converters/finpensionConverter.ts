import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { FinpensionRecord } from "../models/finpensionRecord";

export class FinpensionConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ";",
            fromLine: 2,
            columns: this.processHeaders(input, ";"),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert categories to Ghostfolio type.
                if (context.column === "category") {
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
                    else if (action.indexOf("fee") > -1) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "numberOfShares" ||
                    context.column === "assetPriceInChf" ||
                    context.column === "cashflow") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (_, records: FinpensionRecord[]) => {

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
            const bar1 = this.progress.create(records.length, 0);

            for (let idx = 0; idx < records.length; idx++) {
                const record = records[idx];

                // Check if the record should be ignored.
                if (this.isIgnoredRecord(record)) {
                    bar1.increment();
                    continue;
                }

                // Fees do not have a security, so add those immediately.
                if (record.category.toLocaleLowerCase() === "fee") {

                    const feeAmount = Math.abs(record.cashFlow);

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.category],
                        unitPrice: feeAmount,
                        currency: record.assetCurrency,
                        dataSource: "MANUAL",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.category
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        null,
                        record.assetName,
                        record.assetCurrency,
                        this.progress);
                }
                catch (err) {                    
                    this.logQueryError(record.isin || record.assetName, idx + 2);        
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.category} action for ${record.isin || record.assetName} with currency ${record.assetCurrency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                // Make negative numbers (on sell records) absolute.
                let numberOfShares = Math.abs(record.numberOfShares);
                let assetPriceInChf = Math.abs(record.assetPriceInChf);

                // Dividend record values are retrieved from cashflow.
                if (record.category === "dividend") {
                    numberOfShares = 1;
                    assetPriceInChf = Math.abs(record.cashFlow);
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: 0,
                    quantity: numberOfShares,
                    type: GhostfolioOrderType[record.category],
                    unitPrice: assetPriceInChf,
                    currency: record.assetCurrency,
                    dataSource: "YAHOO",
                    date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: FinpensionRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdraw"];

        return ignoredRecordTypes.some(t => record.category.toLocaleLowerCase().indexOf(t) > -1)
    }
}
