import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { TradeRepublicRecord } from "../models/tradeRepublicRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class TradeRepublicConverter extends AbstractConverter {

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
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert actions to Ghostfolio type.
                if (context.column === "transactionType") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("dividend") > -1) {
                        return "dividend";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "value" ||
                    context.column === "amount" ||
                    context.column === "costs" ||
                    context.column === "tax") {

                    if (columnValue === "") {
                        return 0;
                    }

                    return parseFloat(columnValue.replace(",", "."));
                }

                return columnValue;
            },
            on_record: (record: TradeRepublicRecord) => {

                if (["verkoop", "sell"].some(t => record.transactionType.toLocaleLowerCase().indexOf(t) > -1)) {
                    record.transactionType = "sell";
                }
                if (["aankoop", "buy"].some(t => record.transactionType.toLocaleLowerCase().indexOf(t) > -1)) {
                    record.transactionType = "buy";
                }

                return record;
            }
        }, async (err, records: TradeRepublicRecord[]) => {

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
                            record.note,
                            "EUR",
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.note, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.transactionType} action for ${record.isin}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(`${record.date}`, "YYYY-MM-DD");
                    const unitPrice = Math.abs(parseFloat((record.value / record.amount).toFixed(2)));

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: Math.abs(record.costs),
                        quantity: record.transactionType === "dividend" ? 1 : Math.abs(record.amount),
                        type: GhostfolioOrderType[record.transactionType],
                        unitPrice: record.transactionType === "dividend" ? record.value : unitPrice,
                        currency: "EUR",
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the TradeRepublic CSV export.
        const csvHeaders = [
            "date",
            "transactionType",
            "value",
            "note",
            "isin",
            "amount",
            "costs",
            "tax"]

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: TradeRepublicRecord): boolean {
        const ignoredRecordTypes = ["onttrekking", "storting", "interest", "removal", "deposit"];

        return ignoredRecordTypes.some(t => record.transactionType.toLocaleLowerCase().indexOf(t) > -1)
    }
}
