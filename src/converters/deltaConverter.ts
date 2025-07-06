import dayjs from "dayjs";
import { parse } from "csv-parse";
import { DeltaRecord } from "../models/deltaRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class DeltaConverter extends AbstractConverter {

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

                if (context.column === "baseCurrencyName" && columnValue === "GBX") {
                    return "GBp";
                }

                // Convert actions to Ghostfolio type.
                if (context.column === "way") {
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
                if (context.column === "baseAmount" ||
                    context.column === "quoteAmount" ||
                    context.column === "feeAmount") {

                    if (columnValue.trim() === "") {
                        return 0;
                    }

                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: DeltaRecord[]) => {

            try {

                // Check if parsing failed..
                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error ocurred while parsing!";

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

                    // Temporary skip crypto.
                    if (record.baseType === "CRYPTO") {
                        console.log(`[i] Unsupported base type ${record.baseType} for ${record.way} action for ${record.baseCurrencyName} with currency ${record.quoteCurrency}! Please add this manually..`);
                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            null,
                            record.baseCurrencyName,
                            null,
                            record.quoteCurrency,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.baseCurrencyName, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.way} action for ${record.baseCurrencyName} with currency ${record.quoteCurrency}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    let quantity, unitPrice;

                    if (record.way === "dividend") {
                        quantity = 1;
                        unitPrice = Math.abs(record.quoteAmount);
                    } else {
                        quantity = record.baseAmount;
                        unitPrice = parseFloat((record.quoteAmount / quantity).toFixed(2));
                    }

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: record.notes,
                        fee: record.feeAmount,
                        quantity: quantity,
                        type: GhostfolioOrderType[record.way],
                        unitPrice: unitPrice,
                        currency: record.baseCurrencyName,
                        dataSource: "YAHOO",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: security.symbol
                    });

                    bar1.increment();
                }

                this.progress.stop()

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
    public isIgnoredRecord(record: DeltaRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdraw", "transfer"];

        return ignoredRecordTypes.some(t => record.way.toLocaleLowerCase().indexOf(t) > -1)
    }
}
