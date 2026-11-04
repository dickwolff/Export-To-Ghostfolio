import dayjs from "dayjs";
import { parse } from "csv-parse";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { RobinhoodRecord } from "../models/robinhoodRecord";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class RobinhoodConverter extends AbstractConverter {

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
            delimiter: ",",
            fromLine: 2,
            columns: this.processHeaders(input),
            // The export ends with a disclaimer row that has more columns than the header.
            relax_column_count: true,
            cast: (columnValue, context) => {

                if (context.column === "quantity" ||
                    context.column === "price" ||
                    context.column === "amount") {
                    return this.parseNumericValue(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: RobinhoodRecord[]) => {

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

                // Withheld tax is a separate row, so collect it to add it to the fee of the dividend.
                // Several dividends of one instrument on the same day share the tax in proportion to their amount.
                const withheldTax = new Map<string, number>();
                const dividendTotals = new Map<string, number>();
                for (const record of records) {
                    const key = `${record.activityDate}|${record.instrument}`;
                    const transCode = record.transCode?.toLocaleLowerCase();

                    if (transCode === "nrat" || transCode === "dtax") {
                        withheldTax.set(key, (withheldTax.get(key) ?? 0) + Math.abs(record.amount));
                    }
                    else if (transCode === "cdiv") {
                        dividendTotals.set(key, (dividendTotals.get(key) ?? 0) + record.amount);
                    }
                }

                const bar1 = this.progress.create(records.length, 0);

                for (let idx = 0; idx < records.length; idx++) {
                    const record = records[idx];

                    if (this.isIgnoredRecord(record)) {
                        bar1.increment();
                        continue;
                    }

                    const action = record.transCode.toLocaleLowerCase() === "cdiv" ? "dividend" : record.transCode.toLocaleLowerCase();

                    let quantity = record.quantity;
                    let unitPrice = record.price;
                    let fee = 0;

                    if (action === "dividend") {

                        // The share count is only in the description, e.g. "Cash Div: R/D 2026-09-21 P/D 2026-09-30 - 11.25422 shares at 0.65".
                        const shares = record.description.match(/([\d.]+) shares at/);

                        if (!shares) {
                            this.progress.log(`[i] Could not determine the number of shares for the dividend of ${record.instrument} on ${record.activityDate}! Please add this manually..\n`);
                            bar1.increment();
                            continue;
                        }

                        quantity = parseFloat(shares[1]);
                        unitPrice = record.amount / quantity;

                        const key = `${record.activityDate}|${record.instrument}`;
                        const dividendTotal = dividendTotals.get(key);

                        // Dividends that cancel each other out on one day have no total to split the tax over.
                        fee = dividendTotal ? (withheldTax.get(key) ?? 0) * record.amount / dividendTotal : 0;
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            undefined,
                            // Yahoo Finance writes share classes with a dash (BRK.B is BRK-B).
                            record.instrument.replace(".", "-"),
                            // A dividend description is not a security name.
                            action === "dividend" ? null : record.description.split("\n")[0],
                            "USD",
                            this.progress);
                    }
                    catch (err) {
                        /* istanbul ignore next */
                        this.logQueryError(record.instrument, idx + 2);
                        return errorCallback(err);
                    }

                    if (!security) {
                        this.progress.log(`[i] No result found for ${action} action for ${record.instrument} with currency USD! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: fee,
                        quantity: quantity,
                        type: GhostfolioOrderType[action],
                        unitPrice: unitPrice,
                        currency: security.currency,
                        dataSource: "YAHOO",
                        date: dayjs(record.activityDate, "M/D/YYYY").format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: RobinhoodRecord): boolean {

        // Only trades and dividends are converted. This skips currency exchanges, deposits, interest, options, etc.
        const transCode = record.transCode?.toLocaleLowerCase();

        return !["buy", "sell", "cdiv"].includes(transCode) || (transCode === "cdiv" && !record.amount);
    }

    /**
     * Parse a Robinhood number like "$1,234.50" or "($2,215.78)" (negative) to a float.
     */
    private parseNumericValue(value: string): number {

        if (!value) {
            return 0;
        }

        const number = parseFloat(value.replace(/[$,()]/g, ""));

        return value.startsWith("(") ? -number : number;
    }
}
