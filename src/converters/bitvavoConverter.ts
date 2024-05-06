import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { BitvavoRecord } from "../models/bitvavoRecord";

export class BitvavoConverter extends AbstractConverter {

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
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("buy") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("sell") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("staking") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "amount" ||
                    context.column === "price" ||
                    context.column === "amountReceivedPaid" ||
                    context.column === "feeAmount") {

                    return Math.abs(parseFloat(columnValue));
                }

                return columnValue;
            }
        }, async (_, records: BitvavoRecord[]) => {

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
console.log(record)
                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        `${record.currency}-${record.feeCurrency}`,
                        null,
                        null,
                        null,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.currency, idx + 2);
                    return errorCallback(err);
                }
console.log(security)
                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type} action for ${record.currency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                const date = dayjs(`${record.date} ${record.time}`, "YYYY-MM-DD HH:mm:ss");

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: 0,
                    quantity: record.amount,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: record.price,
                    currency: security.symbol,
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
    public isIgnoredRecord(record: BitvavoRecord): boolean {

        return ["deposit", "withdrawal"].some((t) => record.type.toLocaleLowerCase().indexOf(t) > -1);
    }
}
