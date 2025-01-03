import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { SwissquoteRecord } from "../models/swissquoteRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class SwissquoteConverter extends AbstractConverter {

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
            delimiter: ";",
            fromLine: 2,
            columns: this.processHeaders(input, ";"),
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
                    else if (action.indexOf("custody fees") > -1) {
                        return "fee";
                    }
                    else if (action.indexOf("interest") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "unitPrice" ||
                    context.column === "costs" ||
                    context.column === "netAmount" ||
                    context.column === "netAmountInAccountCurrency") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: SwissquoteRecord[]) => {

            // Check if parsing failed..
            if (err || records === undefined || records.length === 0) {
                let errorMsg = "An error ocurred while parsing!";

                if (err) {
                    errorMsg += ` Details: ${err.message}`
                }

                return errorCallback(new Error(errorMsg))
            }

            // Check if there are any German language records detected.
            if (records.filter(r => this.isGermanLanguageRecord(r)).length > 0) {
                
                const msg = "German language records detected. Please make sure to set your SwissQuote display language to English!";
                this.progress.log(`[i] ${msg}.\n`);
                return errorCallback(new Error(msg));
            }

            console.log("Read CSV file. Start processing..");
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

                // Fee/interest do not have a security, so add those immediately.
                if (record.transaction.toLocaleLowerCase() === "fee" ||
                    record.transaction.toLocaleLowerCase() === "interest") {

                    const date = dayjs(`${record.date}`, "DD-MM-YYYY HH:mm");
                    const feeAmount = Math.abs(record.netAmount);

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.transaction],
                        unitPrice: feeAmount,
                        currency: record.currency,
                        dataSource: "MANUAL",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: "Custody Fees"
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        record.isin,
                        record.symbol,
                        record.name,
                        record.netAmountCurrency ?? record.currency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.isin || record.symbol || record.name, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.transaction} action for ${record.isin || record.symbol || record.name} with currency ${record.currency}! Please add this manually..\n`);
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
                    currency: security.currency ?? record.netAmountCurrency ?? record.currency,
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
    public isIgnoredRecord(record: SwissquoteRecord): boolean {
        const ignoredRecordTypes = ["credit", "debit", "payment", "tax statement"];

        return ignoredRecordTypes.some(t => record.transaction.toLocaleLowerCase().indexOf(t) > -1)
    }

    private isGermanLanguageRecord(record: SwissquoteRecord): boolean {

        const germanRecordTypes = ["kauf", "verkauf", "dividende", "gebühren"];

        return germanRecordTypes.some(t => record.transaction.toLocaleLowerCase().indexOf(t) > -1)
    }
}
