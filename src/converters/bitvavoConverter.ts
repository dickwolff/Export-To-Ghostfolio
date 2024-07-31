import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SecurityService } from "../securityService";
import { BitvavoRecord } from "../models/bitvavoRecord";
import { AbstractConverter } from "./abstractconverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

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

                    return Math.abs(parseFloat(columnValue) || 0);
                }

                return columnValue;
            }
        }, async (err, records: BitvavoRecord[]) => {

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

                // There is no need to query Yahoo Finance for Bitvavo exports as the information can be extracted wholly from the export.

                // Bitvavo is EUR only. Staking does not have a feeCurrency attached. In that case, make it EUR by default.
                let symbol = `${record.currency}-${record.type === "interest" ? "EUR" : record.feeCurrency}`

                const date = dayjs(`${record.date} ${record.time}`, "YYYY-MM-DD HH:mm:ss");

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: record.feeAmount,
                    quantity: record.amount,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: record.quotePrice,
                    currency: "EUR",
                    dataSource: "YAHOO",
                    date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                    symbol: symbol
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the DEGIRO CSV export.
        const csvHeaders = [
            "timezone",
            "date",
            "time",
            "type",
            "currency",
            "amount",
            "quoteCurrency",
            "quotePrice",
            "receivedPaidCurrency",
            "receivedPaidAmount",
            "feeCurrency",
            "feeAmount",
            "status",
            "transactionId",
            "address"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: BitvavoRecord): boolean {

        return ["deposit", "withdrawal"].some((t) => record.type.toLocaleLowerCase().indexOf(t) > -1);
    }
}
