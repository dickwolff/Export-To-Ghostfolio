import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { Trading212Record } from "../models/trading212Record";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class Trading212Converter extends AbstractConverter {

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
                    else if (action.indexOf("interest") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "noOfShares" ||
                    context.column === "priceShare" ||
                    context.column === "total") {
                    return parseFloat(columnValue);
                }

                // Patch GBX currency (should be GBp).
                if (context.column === "currencyPriceShare") {
                    if (columnValue == "GBX") {
                        return "GBp";
                    }
                }

                return columnValue;
            },
            on_record: (record: Trading212Record) => {

                const action = record.action.toLocaleLowerCase();

                // On stock distributions, some fields need rearranging.
                if (action === "stock distribution") {

                    record.action = "buy";
                    record.noOfShares = parseFloat(record.currencyPriceShare);
                    record.priceShare = 0;
                    record.currencyPriceShare = `${record.result}`;
                }

                // On stock splits, some fields need rearranging.
                if (action === "stock split open" ||
                    action === "stock split close") {

                    record.action = action.indexOf("open") > -1 ? "buy" : "sell";
                    record.noOfShares = parseFloat(record.currencyPriceShare);
                    record.priceShare = parseFloat(`${record.exchangeRate}`);
                    record.currencyPriceShare = `${record.result}`;
                }

                return record;
            }
        }, async (err, records: Trading212Record[]) => {

            try {

                // Check if parsing failed..
                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error occurred while parsing!";

                    if (err) {
                        errorMsg += ` Details: ${err.message}`
                    }

                    return errorCallback(new Error(errorMsg))
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

                    // Interest does not have a security, so add those immediately.
                    if (record.action.toLocaleLowerCase() === "interest") {

                        const feeAmount = Math.abs(record.total);

                        // Add fees record to export.
                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: "",
                            fee: feeAmount,
                            quantity: 1,
                            type: GhostfolioOrderType[record.action],
                            unitPrice: feeAmount,
                            currency: record.currencyTotal,
                            dataSource: "MANUAL",
                            date: dayjs(record.time).format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: record.notes
                        });

                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            record.isin,
                            record.ticker,
                            record.name,
                            record.currencyPriceShare,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.isin || record.ticker || record.name, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.action} action for ${record.isin || record.ticker || record.name} with currency ${record.currencyPriceShare}! Please add this manually..\n`);
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

                this.progress.stop();

                successCallback(result);
            }
            catch (error) {
                console.log("[e] An error occurred while processing the file contents. Stack trace:");
                console.log(error.stack);
                this.progress.stop();
                errorCallback(error);
            }
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: Trading212Record): boolean {
        let ignoredRecordTypes = ["deposit", "withdraw", "cash", "currency conversion", "transfer out"];

        return ignoredRecordTypes.some(t => record.action.toLocaleLowerCase().indexOf(t) > -1)
    }
}
