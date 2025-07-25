import dayjs from "dayjs";
import { parse } from "csv-parse";
import { XtbRecord } from "../models/xtbRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class XtbConverter extends AbstractConverter {

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
            skip_empty_lines: true,
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert type to Ghostfolio type.
                if (context.column === "type") {
                    const type = columnValue.toLocaleLowerCase();

                    if (type.indexOf("stocks/etf purchase") > -1 || type.indexOf("ações/etf compra") > -1) {
                        return "buy";
                    }
                    else if (type.indexOf("stocks/etf sale") > -1 || type.indexOf("ações/etf vende") > -1) {
                        return "sell";
                    }
                    else if (type.indexOf("sec fee") > -1 || type.indexOf("swap") > -1 || type.indexOf("commission") > -1 || type.indexOf("free funds interests tax") > -1) {
                        return "fee";
                    }
                    else if (type.indexOf("free funds interests") > -1) {
                        return "interest";
                    }
                    else if (type.indexOf("dividend") > -1 || type.indexOf("spin off") > -1) { //verify spinoff
                        return "dividend";
                    }
                    else if (type.indexOf("profit/loss") > -1) {
                        return "profitloss";
                    }
                }

                if (context.column === "symbol" && columnValue.endsWith(".UK")) {
                    return columnValue.replace(".UK", ".L");
                }

                // Parse numbers to floats (from string).
                if (context.column === "id" || context.column === "amount") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            },
            on_record: (record: XtbRecord) => {

                // Post processing steps.

                // If a record is typed as dividend, but is a negative amount, then change type to fee.
                if (record.type === "dividend" && record.amount < 0) {
                    record.type = "fee";
                }

                // If a record is typed as interest, but is a negative correction, then change type to fee.
                if (record.type === "interest" && record.comment.toLocaleLowerCase().startsWith("corr")) {
                    record.type = record.amount < 0 ? "fee" : "interest";
                }

                // If the record is a profit/loss, check if it should be a fee or interest.
                if (record.type.toLocaleLowerCase() === "profitloss") {
                    if (record.amount < 0) {
                        record.type = "fee";
                    }
                    else {
                        record.type = "interest";
                    }
                }

                return record;
            }
        }, async (err, records: XtbRecord[]) => {

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

                    const date = dayjs(`${record.time}`, "DD.MM.YYYY HH:mm:ss");

                    // Interest does not have a security, so add those immediately.
                    if (record.type.toLocaleLowerCase() === "interest") {

                        // Add interest record to export.
                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: 0,
                            quantity: 1,
                            type: GhostfolioOrderType[record.type],
                            unitPrice: Math.abs(record.amount),
                            currency: process.env.XTB_ACCOUNT_CURRENCY || "EUR",
                            dataSource: "MANUAL",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: record.comment,
                        });

                        bar1.increment();
                        continue;
                    }

                    if (record.type.toLocaleLowerCase() === "fee") {

                        // Add interest record to export.
                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: Math.abs(record.amount),
                            quantity: 1,
                            type: GhostfolioOrderType[record.type],
                            unitPrice: 0,
                            currency: process.env.XTB_ACCOUNT_CURRENCY || "EUR",
                            dataSource: "MANUAL",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: record.comment,
                        });

                        bar1.increment();
                        continue;
                    }

                    const match = record.comment.match(/(?:OPEN|CLOSE) BUY ([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+(?:\.[0-9]+)?)?) @ ([0-9]+(?:\.[0-9]+)?)|(?:[A-Z\. ]+) ([0-9]+(?:\.[0-9]+)?)/)

                    let quantity = parseFloat(match[1]?.split("/")[0]);
                    let unitPrice = parseFloat(match[2]);
                    const dividendPerShare = parseFloat(match[3]);

                    // By default, there is no expected currency.
                    let expectedCurrency = null;

                    // For dividends and spin-offs, the currency is in the comment.
                    if (record.type.toLocaleLowerCase() === "dividend") {
                        expectedCurrency = record.comment.split(" ")[1];
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            null,
                            record.symbol,
                            null,
                            expectedCurrency,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.comment, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for action ${record.type}, symbol ${record.symbol} and comment ${record.comment}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    let feeAmount = 0;

                    // Dividend usually goes with a dividend tax record, so look it up.
                    if (record.type.toLocaleLowerCase() === "dividend") {

                        unitPrice = dividendPerShare;
                        quantity = parseFloat((record.amount / dividendPerShare).toFixed(2));

                        const taxRecord = this.lookupDividendTaxRecord(record.id, records, idx);

                        // If there was a dividend tax record found, check if it matches the dividend record.
                        if (taxRecord && taxRecord.symbol === record.symbol && taxRecord.time === record.time) {
                            feeAmount = Math.abs(taxRecord.amount);
                        }
                    }

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: `XTB ${record.id} - ${record.comment}`,
                        fee: feeAmount,
                        quantity: quantity,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: unitPrice,
                        currency: security.currency,
                        dataSource: "YAHOO",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: security.symbol,
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

        // Generic header mapping from the XTB CSV export.
        const csvHeaders = [
            "id",
            "type",
            "time",
            "symbol",
            "comment",
            "amount"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: XtbRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdrawal", "tax", "transfer"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }

    private lookupDividendTaxRecord(currentRecordId: number, records: XtbRecord[], idx: number): XtbRecord | undefined {

        let taxRecord;

        // Look ahead at the next record (if there are any records left).
        if (idx > 0 && records.length - 1 > idx + 1) {
            const nextRecord = records[idx + 1];
            if (nextRecord.type.toLocaleLowerCase().indexOf("tax") > -1 && currentRecordId + 1 === nextRecord.id) {
                taxRecord = nextRecord;
            }
        }

        // If there is no tax record found, look back at the previous record.
        if (!taxRecord) {

            const previousRecord = records[idx - 1];
            if (previousRecord?.type.toLocaleLowerCase().indexOf("tax") > -1 && currentRecordId + 1 === previousRecord?.id) {
                taxRecord = previousRecord;
            }
        }

        return taxRecord;
    }
}
