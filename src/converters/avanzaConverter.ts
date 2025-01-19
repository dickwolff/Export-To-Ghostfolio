import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AvanzaRecord } from "../models/avanzaRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class AvanzaConverter extends AbstractConverter {

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

                if (context.column === "instrumentCurrency" && columnValue === "GBX") {
                    return "GBp";
                }

                // Convert actions to Ghostfolio type.
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("köp") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("sälj") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("utdelning") > -1) {
                        return "dividend";
                    }
                    else if (action.indexOf("ränta") > -1) {
                        return "interest";
                    }
                    else if (action.indexOf("övrigt") > -1 || action.indexOf("källskatt") > -1) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "price" ||
                    context.column === "amount" ||
                    context.column === "fee" ||
                    context.column === "exchangeRate" ||
                    context.column === "result") {

                    if (columnValue === "") {
                        return 0;
                    }

                    return parseFloat(columnValue.replace(",", "."));
                }

                return columnValue;
            },
            on_record: (record: AvanzaRecord) => {

                // If the record is a fee, but it's a tax return, then it's an interest payment.
                if (record.type === "fee" && record.description.toLocaleLowerCase().indexOf("terbetalning") > -1) {
                    record.type = "interest";
                }

                // If currency is empty, default to SEK.
                if (record.currency === "") {
                    record.currency = "SEK";
                }

                return record;
            }
        }, async (err, records: AvanzaRecord[]) => {

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

                const isFee = record.type.toLocaleLowerCase() === "fee";
                const isInterest = record.type.toLocaleLowerCase() === "interest";

                // Interest and fees do not have a security, so add those immediately.
                if (isFee || isInterest) {
                    console.log("fee or interest", record);
                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: record.description,
                        fee: isFee ? Math.abs(record.amount) : 0,
                        quantity: 1,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: isInterest ? Math.abs(record.amount) : 0,
                        currency: record.currency,
                        dataSource: "MANUAL",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.description
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        record.isin,
                        null,
                        record.description,
                        record.instrumentCurrency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.isin, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type} action for ${record.isin} with currency ${record.instrumentCurrency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                const quantity = Math.abs(record.quantity);
                const unitPrice = Math.abs(record.price);

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: record.fee,
                    quantity: quantity,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: unitPrice,
                    currency: record.instrumentCurrency,
                    dataSource: "YAHOO",
                    date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the Avanza CSV export.
        const csvHeaders = [
            "date",
            "account",
            "type",
            "description",
            "quantity",
            "price",
            "amount",
            "currency",
            "fee",
            "exchangeRate",
            "instrumentCurrency",
            "isin",
            "result"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: AvanzaRecord): boolean {
        let ignoredRecordTypes = ["insättning", "uttag"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
