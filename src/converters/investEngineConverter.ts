import dayjs from "dayjs";
import { parse } from "csv-parse";
import { InvestEngineRecord } from "../models/investEngineRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class InvestEngineConverter extends AbstractConverter {

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

                // Convert transaction types to Ghostfolio type.
                if (context.column === "transactionType") {
                    const transactionType = columnValue.toLowerCase();

                    if (transactionType === "buy") {
                        return "buy";
                    }
                    else if (transactionType === "sell") {
                        return "sell";
                    }
                    // Add dividend in the future?
                }

                // Remove the pound sign (£) from any field.
                columnValue = columnValue.replace(/£/g, "");

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "sharePrice" ||
                    context.column === "totalTradeValue") {

                    return Number.parseFloat(columnValue || "0");
                }

                return columnValue;
            }
        }, async (err, records: InvestEngineRecord[]) => {

            try {

                // Check if parsing failed..
                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error occurred while parsing!";

                    if (err) {
                        errorMsg += ` Details: ${err.message}`
                    }

                    this.progress.stop();
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

                    if (this.isIgnoredRecord(record)) {
                        bar1.increment();
                        continue;
                    }

                    // Extract security name and ISIN from the combined field.
                    const securityParts = record.securityIsin.split(" / ISIN ");
                    const securityName = securityParts[0].trim();
                    const isin = securityParts.length > 1 ? securityParts[1].trim() : null;

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            isin,
                            null,
                            null,
                            "GBP", // InvestEngine uses GBP.
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(isin || securityName, idx + 2);
                        this.progress.stop();
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.transactionType} action for ${securityName} (ISIN: ${isin}) with currency GBP! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(record.tradeDateTime, "DD/MM/YY HH:mm:ss");

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: 0,
                        quantity: record.quantity,
                        type: GhostfolioOrderType[record.transactionType],
                        unitPrice: record.sharePrice,
                        currency: "GBP",
                        dataSource: "YAHOO",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: InvestEngineRecord): boolean {

        // Currently there are no records to ignore.

        return false;
    }
}
