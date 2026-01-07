import dayjs from "dayjs";
import { parse } from "csv-parse";
import { RevolutRecord } from "../models/revolutRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class RevolutConverter extends AbstractConverter {

    private isCrypto = false;

    constructor(securityService: SecurityService) {
        super(securityService);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        if (input.split("\n")[0].split(",").length === 7) {
            this.isCrypto = true;
            return this.processCryptoFileContents(input, successCallback, errorCallback);
        }

        return this.processInvestFileContents(input, successCallback, errorCallback);
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: RevolutRecord): boolean {
        let ignoredRecordTypes = ["transfer from", "withdrawal", "top-up", "stake", "send", "receive"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().includes(t))
    }

    private processInvestFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ",",
            fromLine: 2,
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                if (context.column === "currency" && columnValue === "GBX") {
                    return "GBp";
                }

                // Convert actions to Ghostfolio type.
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.includes("buy") || action.includes("stock split")) {
                        return "buy";
                    }
                    else if (action.includes("sell")) {
                        return "sell";
                    }
                    else if (action.includes("dividend")) {
                        return "dividend";
                    }
                    else if (action.includes("fee")) {
                        return "fee";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantity" ||
                    context.column === "pricePerShare" ||
                    context.column === "totalAmount") {                        
                    return this.parseNumericValue(columnValue.replace(",", "."));
                }

                return columnValue;
            }
        }, async (err, records: RevolutRecord[]) => await this.processRevolutFile(err, records, successCallback, errorCallback));
    }

    private processCryptoFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ",",
            fromLine: 2,
            columns: this.processHeaders(input),
            on_record: (record: RevolutRecord) => {

                // Custom mapping below.

                const recordType = record.type.toLocaleLowerCase();
                record.type = recordType === "buy" ? "buy" : recordType === "sell" ? "sell" : "dividend";

                record.currency = this.detectCurrency(`${record.price}`);

                record.price = this.parseNumericValue(`${record.price}`);
                record.value = this.parseNumericValue(`${record.value}`);
                record.fees = this.parseNumericValue(`${record.fees}`);

                record.quantity = Number.parseFloat(`${record.quantity}`);

                return record;
            }
        }, async (err, records: RevolutRecord[]) => await this.processRevolutFile(err, records, successCallback, errorCallback));
    }

    private async processRevolutFile(err, records: RevolutRecord[], successCallback: any, errorCallback: any) {

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

                // Fees do not have a security, so add those immediately.
                if (record.type.toLocaleLowerCase() === "fee") {

                    const feeAmount = Math.abs(record.totalAmount);

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: `Revolut ${record.type.toLocaleLowerCase()}`,
                        fee: feeAmount,
                        quantity: 1,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: 0,
                        currency: record.currency,
                        dataSource: "MANUAL",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: `Revolut ${record.type.toLocaleLowerCase()}`,
                        tags: getTags()
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        null,
                        record.ticker ?? `${record.symbol}-${record.currency}`,
                        null,
                        record.currency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.ticker, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type} action for ${record.ticker ?? record.symbol} with currency ${record.currency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                let quantity, unitPrice;

                if (record.type === "dividend") {
                    quantity = record.quantity ?? 1;
                    unitPrice = Math.abs(record.totalAmount ?? 1);
                } else {
                    quantity = record.quantity;
                    unitPrice = record.pricePerShare ?? record.price;
                }

                // For USD crypto securities, remove the dash (as Ghostfolio otherwise won't accept it).
                if (this.isCrypto && record.currency.toLocaleUpperCase() === "USD") {
                    security.symbol = security.symbol.replace(/-/, "");
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: null,
                    fee: 0,
                    quantity: quantity,
                    type: GhostfolioOrderType[record.type],
                    unitPrice: unitPrice,
                    currency: record.currency,
                    dataSource: "YAHOO",
                    date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    }

    private detectCurrency(value: string) {

        // Remove all the numbers from the string, so we can detect the currency.
        const currency = value.replace(/([\d.,]+)/g, "").trim();

        switch (currency.toLocaleUpperCase()) {
            case "€":
                return "EUR";
            case "$":
                return "USD";
            case "£":
                return "GBP";
            case "SEK":
                return "SEK";
            default:
                return "EUR";
        }
    }

    private parseNumericValue(value: string): number {
        if (value === "") {
            return 0;
        }

        const amount = value.match(/([\d.,]+)/g);
        if (amount) {
            const result = Number.parseFloat(amount[0].replace(/,/g, ""));
            if (!Number.isNaN(result)) {
                return result;
            }
        }

        throw new Error(`${value} is not a currency value`);
    }
}