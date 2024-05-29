import dayjs from "dayjs";
import { parse } from "csv-parse";
import { BuxRecord } from "../models/buxRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class BuxConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
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

                // Convert actions to Ghostfolio type.
                if (context.column === "transactionType") {
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
                    else if (action.indexOf("interest") > -1) {
                        return "interest";
                    }
                    else if (action.indexOf("fee") > -1) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "exchangeRate" ||
                    context.column === "transactionAmount" ||
                    context.column === "tradeAmount" ||
                    context.column === "tradePrice" ||
                    context.column === "tradeQuantity" ||
                    context.column === "cashBalanceAmount") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (_, records: BuxRecord[]) => {

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

                // Interest and fees do not have a security, so add those immediately.
                if (record.transactionType.toLocaleLowerCase() === "interest" ||
                    record.transactionType.toLocaleLowerCase() === "fee") {

                    const feeAmount = Math.abs(record.transactionAmount);

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.transactionType],
                        unitPrice: feeAmount,
                        currency: record.transactionCurrency,
                        dataSource: "MANUAL",
                        date: dayjs(record.transactionTime).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.assetName
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        record.assetId,
                        null,
                        record.assetName,
                        record.assetCurrency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.assetId || record.assetName, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.transactionType} action for ${record.assetId || record.assetName} with currency ${record.assetCurrency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                let quantity, unitPrice;

                if (record.transactionType === "dividend") {
                    quantity = 1;
                    unitPrice = Math.abs(record.transactionAmount);
                } else {
                    quantity = record.tradeQuantity;
                    unitPrice = record.tradePrice;
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: 0,
                    quantity: quantity,
                    type: GhostfolioOrderType[record.transactionType],
                    unitPrice: unitPrice,
                    currency: record.transactionCurrency,
                    dataSource: "YAHOO",
                    date: dayjs(record.transactionTime).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: BuxRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdrawal"];

        return ignoredRecordTypes.some(t => record.transactionType.toLocaleLowerCase().indexOf(t) > -1)
    }
}
