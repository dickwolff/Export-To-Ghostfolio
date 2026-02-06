import dayjs from "dayjs";
import { parse } from "csv-parse";
import { getTags } from "../helpers/tagHelpers";
import { FlatexRecord } from "../models/flatexRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class FlatexConverter extends AbstractConverter {

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
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert actions to Ghostfolio type.
                if (context.column === "transactionInformation") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.includes("storno")) {
                        return "deposit";
                    }
                    else if (action.includes("kauf")) {
                        return "buy";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "amount" ||
                    context.column === "price" ||
                    context.column === "exchangeRate") {

                    if (columnValue.trim() === "") {
                        return 0;
                    }

                    return Number.parseFloat(columnValue);
                }

                return columnValue;
            },
            on_record: (record: FlatexRecord) => {

                // If a buy record has a negative quantity, it is actually a sell record.
                if (record.transactionInformation === "buy" && record.quantity < 0) {
                    record.transactionInformation = "sell";
                }

                return record;
            }
        }, async (err, records: FlatexRecord[]) => {

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
                        this.logQueryError(record.isin, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.transactionInformation} action for ${record.isin} with currency ${record.currency}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(record.bookingDate, "DD.MM.YYYY");

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: 0,
                        quantity: Math.abs(record.quantity),
                        type: GhostfolioOrderType[record.transactionInformation],
                        unitPrice: Math.abs(record.price),
                        currency: record.currency,
                        dataSource: "YAHOO",
                        date: dayjs(date).format("YYYY-MM-DDTHH:mm:ssZ"),
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

        // Generic header mapping from the Flatex CSV export.
        const csvHeaders = [
            "bookingDate",
            "valueDate",
            "description",
            "isin",
            "quantity",
            "unit",
            "amount",
            "currency",
            "price",
            "priceCurrency",
            "exchangeRate",
            "transactionNumber",
            "transactionInformation"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: FlatexRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdraw"];

        return ignoredRecordTypes.some(t => record.transactionInformation.toLocaleLowerCase().includes(t));
    }
}
