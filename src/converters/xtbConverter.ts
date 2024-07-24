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
            columns: this.processHeaders(input, ";"),
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
                    else if (type.indexOf("free funds interests") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "amount") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: XtbRecord[]) => {

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
                let extraIncrement = 0;

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
                        comment: record.comment,
                        fee: 0,
                        quantity: 1,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: record.amount,
                        currency: process.env.XTB_ACCOUNT_CURRENCY || "EUR",
                        dataSource: "MANUAL",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.comment,
                    });

                    bar1.increment();
                    continue;
                }

                let fees = 0;
                let orderType = GhostfolioOrderType[record.type];
                let comment = record.comment;
                let quantity;
                let unitPrice;

                const match = record.comment.match(/(?:OPEN|CLOSE) BUY (\d+|(?:[0-9]*[.])?[0-9]+)(?:\/(?:[0-9]*[.])?[0-9]+)? @ ((?:[0-9]*[.])?[0-9]+)/)                                
                if (match) {
                    quantity = parseFloat(match[1]);
                    unitPrice = parseFloat(match[2]);
                }
                
                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        null,
                        record.symbol,
                        null,
                        null,
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

                // Check if this record is about a CFD. 
                // A CFD transaction exists of two records, a fee record (1st) and a profit/loss record (2nd).
                if (comment.toLocaleLowerCase().includes("of position #")) {

                    // Alter the properties for the fee.
                    quantity = 1;
                    fees = Math.abs(record.amount);
                    comment = `CFD position #${comment.split("#")[1]}`

                    // Get the 
                    const cfdTxRecord = records[idx + 1];
                    orderType = GhostfolioOrderType.sell
                    unitPrice = Math.abs(cfdTxRecord.amount);

                    // Skip the next record, as this is already processed in this iteration.
                    extraIncrement = 1;
                }

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: comment,
                    fee: fees,
                    quantity: quantity,
                    type: orderType,
                    unitPrice: unitPrice,
                    currency: security.currency,
                    dataSource: "YAHOO",
                    date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                    symbol: security.symbol,
                });

                bar1.increment(extraIncrement + 1);
                idx += extraIncrement;
            }

            this.progress.stop()

            successCallback(result);
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: XtbRecord): boolean {
        let ignoredRecordTypes = ["deposit"];
        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
