import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SecurityService } from "../securityService";
import { AbstractConverter } from "./abstractconverter";
import { CoinbaseRecord } from "../models/coinbaseRecord";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class CoinbaseConverter extends AbstractConverter {

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
                if (context.column === "quantity" ||
                    context.column === "price" ||
                    context.column === "subtotal" ||
                    context.column === "total" ||
                    context.column === "fees") {

                    if (columnValue === "") {
                        return 0;
                    }

                    // extract the dnumber from the string
                    return Math.abs(parseFloat(columnValue.match(/(\d+.\d+)/)[0]));
                }

                return columnValue;
            }
        }, async (err, records: CoinbaseRecord[]) => {

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

                    // There is no need to query Yahoo Finance for Coinbase exports as the information can be extracted wholly from the export.

                    let symbol = `${record.asset}-${record.priceCurrency}`

                    const date = dayjs(record.timestamp, "YYYY-MM-DD HH:mm:ss");

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: record.fees,
                        quantity: record.quantity,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: record.price,
                        currency: "EUR",
                        dataSource: "YAHOO",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: symbol
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

        // Generic header mapping from the Coinbase CSV export.
        const csvHeaders = [
            "id",
            "timestamp",
            "type",
            "asset",
            "quantity",
            "priceCurrency",
            "price",
            "subtotal",
            "total",
            "fees",
            "notes"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: CoinbaseRecord): boolean {

        return ["send", "receive", "convert"].some((t) => record.type.toLocaleLowerCase().indexOf(t) > -1);
    }
}
