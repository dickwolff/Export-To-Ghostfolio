import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { RabobankRecord } from "../models/rabobankRecord";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class RabobankConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);

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
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("verkoop fondsen") > -1) {
                        return "sell";
                    }
                    else if (action.indexOf("koop fondsen") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("dividend") > -1) {
                        return "dividend";
                    }
                    else if (action.indexOf("rente") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "amount" ||
                    context.column === "price" ||
                    context.column === "totalAmount" ||
                    context.column === "currencyCosts") {

                    return Math.abs(parseFloat(columnValue.replace(",", ".")));
                }

                return columnValue;
            }
        }, async (_, records: RabobankRecord[]) => {

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

                const date = dayjs(`${record.date}`, "DD-MM-YYYY");

                // Interest or platform fees do not have a security, so add those immediately.
                if (record.type.toLocaleLowerCase() === "interest" ||
                    record.type.toLocaleLowerCase().indexOf("tarieven") > -1) {

                    let orderType = GhostfolioOrderType[record.type];
                    let description = "";

                    if (record.type.toLocaleLowerCase().indexOf("tarieven") > -1) {
                        orderType = GhostfolioOrderType.fee;
                        description = record.type;
                    }

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: 0,
                        quantity: 1,
                        type: orderType,
                        unitPrice: record.totalAmount,
                        currency: record.currency,
                        dataSource: "MANUAL",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: description
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        null,
                        record.name,
                        record.currency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.isin, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type} action for ${record.name}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                let price, quantity, fees = 0;

                // On dividend records, amount and quantity are reversed.
                if (record.type === "dividend") {
                    quantity = record.price;
                    price = record.amount;
                    fees = 0;
                }
                else {
                    quantity = record.amount
                    price = record.price;
                    fees = record.currencyCosts;
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: fees,
                    quantity: quantity,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: price,
                    currency: record.currency,
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the DEGIRO CSV export.
        const csvHeaders = [
            "account",
            "name",
            "date",
            "type",
            "currency",
            "amount",
            "price",
            "priceCurrency",
            "currencyCosts",
            "value",
            "totalAmount",
            "isin",
            "time",
            "exchange"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: RabobankRecord): boolean {
        let ignoredRecordTypes = ["storting", "opname"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
