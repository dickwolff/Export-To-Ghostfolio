import dayjs from "dayjs";
import { parse } from "csv-parse";
import { getTags } from "../helpers/tagHelpers";
import { SecurityService } from "../securityService";
import { AbstractConverter } from "./abstractconverter";
import { ScalableCapitalRecord } from "../models/scalableCapitalRecord";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import YahooFinanceRecord from "../models/yahooFinanceRecord";

export class ScalableCapitalConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
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

                // Convert actions to Ghostfolio type.
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.includes("savings plan")) {
                        return "buy";
                    }
                    else if (action.includes("distribution")) {
                        return "dividend";
                    }
                    else if (action.includes("taxes")) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "shares" ||
                    context.column === "price" ||
                    context.column === "amount" ||
                    context.column === "fee" ||
                    context.column === "tax") {
                    if (columnValue === "") {
                        return 0;
                    }

                    return Math.abs(Number.parseFloat(columnValue.replace(",", ".")));
                }

                return columnValue;
            }
        }, async (err, records: ScalableCapitalRecord[]) => {

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

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            record.isin,
                            null,
                            record.description,
                            record.currency,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.isin || record.description, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.type} action for ${record.isin || record.description} with currency ${record.currency}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(`${record.date} ${record.time}`, "YYYY-MM-DD HH:mm:ss");

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: `${record.reference} - ${record.description}`,
                        fee: record.fee,
                        quantity: record.shares,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: record.price,
                        currency: record.currency,
                        dataSource: "YAHOO",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: security.symbol,
                        tags: getTags()
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
    public isIgnoredRecord(record: ScalableCapitalRecord): boolean {

        return ["withdrawal", "deposit"].some((t) => record.type.toLocaleLowerCase().indexOf(t) > -1);
    }
}
