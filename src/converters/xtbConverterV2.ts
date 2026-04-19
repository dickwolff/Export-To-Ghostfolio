import path from "path";
import dayjs from "dayjs";
import {parse} from "csv-parse";
import {AbstractConverter} from "./abstractconverter";
import {SecurityService} from "../securityService";
import {GhostfolioExport} from "../models/ghostfolioExport";
import {XtbV2Record} from "../models/xtbV2Record";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import {GhostfolioOrderType} from "../models/ghostfolioOrderType";
import {getTags} from "../helpers/tagHelpers";

// XTB V2 (2025+) Cash Operations CSV format.
// Differences from V1 (XtbConverter):
//   - 4-line metadata preamble precedes the header row
//   - Column order: Type;Ticker;Instrument;Time;Amount;ID;Comment;Product
//   - Amounts use European notation (comma decimal, optional dot thousands separator)
//   - Datetime: "YYYY-MM-DD HH:mm:ss" UTC
//   - Type names differ: "Stock purchase" / "Stock sell" instead of "Stocks/ETF purchase" etc.
//   - Ticker uses XTB exchange suffixes (.UK, .PL, .NL, .FR, .US) — normalised to Yahoo format
//
// Enable: run `npm run start -- xtb-v2` (manual) or drop the file in the watch folder (auto-detected).
export class XtbConverterV2 extends AbstractConverter {

    // Cash-activity currency: PLN for IKE/IKZE accounts, otherwise derived from filename or env.
    private accountCurrency: string = process.env.XTB_ACCOUNT_CURRENCY || "EUR";

    constructor(securityService: SecurityService) {
        super(securityService);
    }

    /** @inheritdoc — detects account currency from the filename before delegating. */
    public readAndProcessFile(inputFile: string, successCallback: CallableFunction, errorCallback: CallableFunction): void {
        this.accountCurrency = XtbConverterV2.detectAccountCurrency(path.basename(inputFile));
        super.readAndProcessFile(inputFile, successCallback, errorCallback);
    }

    /**
     * Derives the cash-activity currency from a CSV export filename.
     * IKE and IKZE accounts are legally PLN-only for cash; other accounts
     * use the currency slot from `<optional prefix>_<currency>_<accountId>_<from>_<to>`.
     * Falls back to the XTB_ACCOUNT_CURRENCY env var, then "EUR".
     *
     * Examples:
     *   xtb_EUR_12345_…csv      → EUR
     *   XTB_IKE_12345_…csv      → PLN
     *   XTB_IKZE_12345_…csv     → PLN
     *   XTB_EUR_12345_…csv      → EUR
     *   XTB_PLN_12345_…csv      → PLN
     *   anything_EUR_12345_…csv → EUR
     *   IKE_12345_…csv          → PLN
     *   EUR_12345_…csv          → EUR
     *   PLN_12345_…csv          → PLN
     */
    static detectAccountCurrency(basename: string): string {
        const filename = basename.replace(/\.[^.]+$/, "").toUpperCase();
        const patternMatch = filename.match(/(?:^|_)(IKE|IKZE|[A-Z]{3})_\d+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/);
        const marker = patternMatch?.[1];

        if (marker === "IKE" || marker === "IKZE") return "PLN";
        if (marker) return marker;

        return process.env.XTB_ACCOUNT_CURRENCY || "EUR";
    }

    /** @inheritdoc */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // The export has a 4-line metadata preamble before "Type;Ticker;…".
        const lines = input.split("\n");
        const headerIdx = lines.findIndex(l => l.trim().startsWith("Type;Ticker;"));

        if (headerIdx === -1) {
            return errorCallback(new Error("Could not find the header row in XTB V2 export. Expected a row starting with 'Type;Ticker;'."));
        }

        parse(lines.slice(headerIdx).join("\n"), {
            delimiter: ";",
            fromLine: 2,
            skip_empty_lines: true,
            columns: ["type", "ticker", "instrument", "time", "amount", "id", "comment", "product"],
            cast: (columnValue, context) => {

                if (context.column === "amount") {
                    if (!columnValue || columnValue.trim() === "") return 0;
                    // European format: optional dot thousands separator, comma decimal.
                    return parseFloat(columnValue.replace(/\./g, "").replace(",", "."));
                }

                if (context.column === "id") {
                    return parseInt(columnValue, 10);
                }

                // XTB uses exchange-specific suffixes that differ from Yahoo Finance.
                if (context.column === "ticker") {
                    return this.normalizeXtbTicker(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: XtbV2Record[]) => {

            try {

                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error occurred while parsing!";
                    if (err) errorMsg += ` Details: ${err.message}`;
                    return errorCallback(new Error(errorMsg));
                }

                console.log("[i] Read CSV file. Start processing..");

                const result: GhostfolioExport = {
                    meta: {date: new Date(), version: "v0"},
                    activities: []
                };

                const bar1 = this.progress.create(records.length, 0);

                for (let idx = 0; idx < records.length; idx++) {
                    const record = records[idx];

                    if (this.isIgnoredRecord(record)) {
                        bar1.increment();
                        continue;
                    }

                    const type = record.type.trim();
                    const date = dayjs(record.time.trim(), "YYYY-MM-DD HH:mm:ss");

                    // ── INTEREST ─────────────────────────────────────────────────────────
                    if (type === "Free funds interest") {

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: 0,
                            quantity: 1,
                            type: GhostfolioOrderType["interest"],
                            unitPrice: Math.abs(record.amount),
                            currency: this.accountCurrency,
                            dataSource: "MANUAL",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: record.comment,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    // ── INTEREST TAX → FEE ───────────────────────────────────────────────
                    if (type === "Free funds interest tax") {

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: Math.abs(record.amount),
                            quantity: 1,
                            type: GhostfolioOrderType["fee"],
                            unitPrice: 0,
                            currency: this.accountCurrency,
                            dataSource: "MANUAL",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: record.comment,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    // ── BUY / SELL ────────────────────────────────────────────────────────
                    if (type === "Stock purchase" || type === "Stock sell") {

                        // Comment: "OPEN BUY 22 @ 154.0800" or "CLOSE BUY 2100/2342 @ 2.9765"
                        const tradeMatch = record.comment.match(
                            /(?:OPEN|CLOSE) BUY ([\d.]+)(?:\/[\d.]+)? @ ([\d.]+)/i
                        );

                        if (!tradeMatch) {
                            this.progress.log(`[i] Cannot parse quantity/price from comment "${record.comment}" (line ${idx + 2}). Skipping..\n`);
                            bar1.increment();
                            continue;
                        }

                        const quantity = parseFloat(tradeMatch[1]);
                        const unitPrice = parseFloat(tradeMatch[2]);

                        let security: YahooFinanceRecord;
                        try {
                            security = await this.securityService.getSecurity(
                                null, record.ticker, record.instrument, null, this.progress);
                        } catch (err) {
                            this.logQueryError(record.ticker, idx + 2);
                            return errorCallback(err);
                        }

                        if (!security) {
                            this.progress.log(`[i] No result found for ${type} action, symbol ${record.ticker}! Please add this manually..\n`);
                            bar1.increment();
                            continue;
                        }

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: 0,
                            quantity,
                            type: GhostfolioOrderType[type === "Stock purchase" ? "buy" : "sell"],
                            unitPrice,
                            currency: this.accountCurrency,
                            dataSource: "YAHOO",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: security.symbol,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    // ── DIVIDEND ──────────────────────────────────────────────────────────
                    if (type === "Dividend") {

                        // Comment: "DTLE.UK EUR 0.0642/ SHR" → currency=EUR, perShare=0.0642
                        const divMatch = record.comment.match(/^\S+\s+(\w+)\s+([\d.]+)\//);

                        if (!divMatch) {
                            this.progress.log(`[i] Cannot parse dividend comment "${record.comment}" (line ${idx + 2}). Skipping..\n`);
                            bar1.increment();
                            continue;
                        }

                        const divCurrency = divMatch[1];
                        const perShare = parseFloat(divMatch[2]);
                        const quantity = parseFloat((record.amount / perShare).toFixed(2));

                        // WHT record has id = dividendId + 1; fold it as the fee field.
                        const taxRecord = this.lookupWithholdingTaxRecord(record.id, records, idx);
                        const feeAmount = taxRecord ? Math.abs(taxRecord.amount) : 0;

                        let security: YahooFinanceRecord;
                        try {
                            security = await this.securityService.getSecurity(
                                null, record.ticker, record.instrument, divCurrency, this.progress);
                        } catch (err) {
                            this.logQueryError(record.ticker, idx + 2);
                            return errorCallback(err);
                        }

                        if (!security) {
                            this.progress.log(`[i] No result found for Dividend, symbol ${record.ticker}! Please add this manually..\n`);
                            bar1.increment();
                            continue;
                        }

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: feeAmount,
                            quantity,
                            type: GhostfolioOrderType["dividend"],
                            unitPrice: perShare,
                            currency: this.accountCurrency,
                            dataSource: "YAHOO",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: security.symbol,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    // ── TAX IFTT → FEE (French financial transaction tax, has a security) ─
                    if (type === "Tax IFTT") {

                        let security: YahooFinanceRecord;
                        try {
                            security = await this.securityService.getSecurity(
                                null, record.ticker, record.instrument, null, this.progress);
                        } catch (err) {
                            this.logQueryError(record.ticker, idx + 2);
                            return errorCallback(err);
                        }

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: `XTB ${record.id} - ${record.comment}`,
                            fee: Math.abs(record.amount),
                            quantity: 1,
                            type: GhostfolioOrderType["fee"],
                            unitPrice: 0,
                            currency: security?.currency ?? this.accountCurrency,
                            dataSource: security ? "YAHOO" : "MANUAL",
                            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
                            symbol: security?.symbol ?? record.comment,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    this.progress.log(`[i] Unknown type "${type}" (line ${idx + 2}). Skipping..\n`);
                    bar1.increment();
                }

                this.progress.stop();
                successCallback(result);

            } catch (error) {
                console.log("[e] An error occurred while processing the file contents. Stack trace:");
                console.log(error.stack);
                this.progress.stop();
                errorCallback(error);
            }
        });
    }

    /** @inheritdoc */
    public isIgnoredRecord(record: XtbV2Record): boolean {
        const type = record.type.trim().toLocaleLowerCase();
        return (
            type === "total" ||
            type === "transfer" ||
            type === "deposit" ||
            type === "withdrawal" ||
            type === "withholding tax" ||    // consumed via lookupWithholdingTaxRecord when processing dividends
            type.startsWith("ike ")          // "IKE deposit", "IKE cash transfer in", etc.
        );
    }

    /** @inheritdoc — V2 uses hardcoded columns; preamble is stripped before parsing. */
    protected processHeaders(_: string): string[] {
        return ["type", "ticker", "instrument", "time", "amount", "id", "comment", "product"];
    }

    // Maps XTB exchange suffixes to Yahoo Finance conventions.
    // Required: Yahoo does not index .UK, .PL, .NL, .FR, .US instruments.
    private normalizeXtbTicker(ticker: string): string {
        if (!ticker) return ticker;
        if (ticker.endsWith(".UK")) return ticker.slice(0, -3) + ".L";
        if (ticker.endsWith(".PL")) return ticker.slice(0, -3) + ".WA";
        if (ticker.endsWith(".NL")) return ticker.slice(0, -3) + ".AS";
        if (ticker.endsWith(".FR")) return ticker.slice(0, -3) + ".PA";
        if (ticker.endsWith(".US")) return ticker.slice(0, -3);
        return ticker;
    }

    // XTB assigns withholding tax the ID immediately following the dividend (dividendId + 1).
    // In the export (sorted newest-first) the WHT row appears before the dividend row.
    private lookupWithholdingTaxRecord(dividendId: number, records: XtbV2Record[], idx: number): XtbV2Record | undefined {
        const whtId = dividendId + 1;
        const prev = records[idx - 1];
        if (prev?.type.trim() === "Withholding tax" && prev.id === whtId) return prev;
        const next = records[idx + 1];
        if (next?.type.trim() === "Withholding tax" && next.id === whtId) return next;
        return undefined;
    }
}
