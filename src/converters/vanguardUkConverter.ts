import dayjs from "dayjs";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioAssetProfile, GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { VanguardUkInvestmentRecord, VanguardUkRecord } from "../models/vanguardUkRecord";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

// Fixed so repeated imports reuse the same Ghostfolio asset profiles.
const FEE_SYMBOL = "6f3c1a52-2d0b-4a9e-9a53-1c8b7f0e4d21";
const INTEREST_SYMBOL = "b4e8d7a1-5c36-4f0a-8e2b-93a1d6c7f580";

export class VanguardUkConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);

        dayjs.extend(customParseFormat);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // The export holds multiple tables, so split out the cash transactions.
        const lines = input.split(/\r?\n/);
        const cashStart = lines.findIndex(line => /^Date,Details,/i.test(line));

        if (cashStart === -1) {
            return errorCallback(new Error("An error occurred while parsing! Details: Cash transactions header not found"));
        }

        let cashEnd = lines.findIndex((line, idx) => idx > cashStart && /^Balance,/i.test(line));
        if (cashEnd === -1) {
            cashEnd = lines.length;
        }

        const cashSection = lines.slice(cashStart + 1, cashEnd).join("\n");

        parse(cashSection, {
            delimiter: ",",
            relax_column_count: true,
            skip_empty_lines: true,
            // The export has two trailing empty columns.
            columns: ["date", "details", "amount", "balance", false, false],
            cast: (columnValue, context) => {
                if (context.column === "amount" || context.column === "balance") {
                    return columnValue === "" ? 0 : parseFloat(columnValue.replace(/,/g, ""));
                }

                return columnValue;
            }
        }, async (err, records: VanguardUkRecord[]) => {

            try {

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
                    accounts: [{
                        balances: this.getBalances(records),
                        comment: null,
                        currency: "GBP",
                        id: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        name: "Vanguard UK",
                        platformId: null
                    }],
                    assetProfiles: [
                        this.createAssetProfile(FEE_SYMBOL, "Vanguard UK Account Fee"),
                        this.createAssetProfile(INTEREST_SYMBOL, "Vanguard UK Cash Interest")
                    ],
                    activities: []
                }

                // Older cash lines lack a ticker, so look it up in the investment transactions table.
                const tickersByTrade = this.getTickersByTrade(lines, cashEnd);

                // Trades by date and fund name, so a following dealing fee can be added to its trade (null when the trade was skipped).
                const trades = new Map<string, GhostfolioActivity | null>();

                // A dealing fee can be listed before its trade, so they are matched once all trades are known.
                const dealingFees: { tradeKey: string, details: string, date: string, amount: number }[] = [];

                const bar1 = this.progress.create(records.length, 0);

                for (let idx = 0; idx < records.length; idx++) {
                    const record = records[idx];

                    if (this.isIgnoredRecord(record)) {
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(record.date, "DD/MM/YYYY").format("YYYY-MM-DDTHH:mm:ssZ");
                    const details = record.details.trim();

                    const dealingFee = details.match(/^ETF dealing fee \((?:buy|sell)\) (.+)$/i);
                    if (dealingFee) {
                        dealingFees.push({ tradeKey: `${record.date}|${dealingFee[1]}`, details: details, date: date, amount: record.amount });
                        bar1.increment();
                        continue;
                    }

                    // Interest and account fees do not have a security, so add those immediately.
                    if (/cash account interest|interest paid on cash/i.test(details)) {
                        result.activities.push(this.createCashActivity(GhostfolioOrderType.interest, details, date, record.amount));
                        bar1.increment();
                        continue;
                    }

                    if (/^account fee/i.test(details)) {
                        result.activities.push(this.createCashActivity(GhostfolioOrderType.fee, details, date, record.amount));
                        bar1.increment();
                        continue;
                    }

                    const dividend = details.match(/^DIV:\s*([^.\s]+)\S*\s*@\s*([A-Z]{3})\s*([\d.]+)/i);
                    const trade = details.match(/^(Bought|Sold) ([\d,.]+) (.+)$/i);

                    let symbol: string;
                    let name: string = null;
                    let currency = "GBP";
                    let quantity: number;
                    let unitPrice: number;
                    let action: string;

                    if (dividend) {
                        action = "dividend";
                        symbol = dividend[1];
                        currency = dividend[2];
                        unitPrice = parseFloat(dividend[3]);

                        // The export has no share count, so derive it from the payout.
                        quantity = Math.round(record.amount / unitPrice);
                    }
                    else if (trade) {
                        action = trade[1].toLocaleLowerCase() === "bought" ? "buy" : "sell";
                        quantity = parseFloat(trade[2].replace(/,/g, ""));
                        name = trade[3];
                        unitPrice = Math.abs(record.amount) / quantity;

                        symbol = name.match(/\(([A-Z0-9]+)\)\s*$/)?.[1]
                            ?? tickersByTrade.get(this.getTradeKey(quantity, record.amount));
                    }
                    else {
                        this.progress.log(`[i] Unknown cash transaction '${details}' on ${record.date}, skipping..\n`);
                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            undefined,
                            symbol,
                            name,
                            currency,
                            this.progress);
                    }
                    catch (err) {
                        /* istanbul ignore next */
                        this.logQueryError(symbol || name, idx + 2);
                        return errorCallback(err);
                    }

                    if (!security) {
                        this.progress.log(`[i] No result found for ${action} action for ${symbol || name} with currency ${currency}! Please add this manually..\n`);

                        if (trade) {
                            trades.set(`${record.date}|${name}`, null);
                        }

                        bar1.increment();
                        continue;
                    }

                    const activity: GhostfolioActivity = {
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: details,
                        fee: 0,
                        quantity: quantity,
                        type: GhostfolioOrderType[action],
                        unitPrice: unitPrice,
                        currency: security.currency,
                        dataSource: "YAHOO",
                        date: date,
                        symbol: security.symbol,
                        tags: getTags()
                    };

                    result.activities.push(activity);

                    if (trade) {
                        trades.set(`${record.date}|${name}`, activity);
                    }

                    bar1.increment();
                }

                for (const dealingFee of dealingFees) {

                    // A fee without a trade is charged on its own; a fee of a skipped trade is dropped with it.
                    if (!trades.has(dealingFee.tradeKey)) {
                        result.activities.push(this.createCashActivity(GhostfolioOrderType.fee, dealingFee.details, dealingFee.date, dealingFee.amount));
                    }
                    else if (trades.get(dealingFee.tradeKey)) {
                        trades.get(dealingFee.tradeKey).fee += Math.abs(dealingFee.amount);
                    }
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
    public isIgnoredRecord(record: VanguardUkRecord): boolean {

        // Rows without a date are blank separators; deposits and withdrawals are reflected in the account balances.
        return this.isBlankRecord(record) || /^(deposit|withdrawal)/i.test(record.details);
    }

    /**
     * Check if a cash row is a blank separator rather than a transaction.
     */
    private isBlankRecord(record: VanguardUkRecord): boolean {
        return !record.date || !/^\d{2}\/\d{2}\/\d{4}$/.test(record.date);
    }

    /**
     * Create an activity for a fee or interest, which has no security of its own.
     */
    private createCashActivity(type: GhostfolioOrderType, details: string, date: string, amount: number): GhostfolioActivity {
        const isFee = type === GhostfolioOrderType.fee;

        return {
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: details,
            fee: isFee ? Math.abs(amount) : 0,
            quantity: isFee ? 0 : 1,
            type: type,
            unitPrice: isFee ? 0 : amount,
            currency: "GBP",
            dataSource: "MANUAL",
            date: date,
            symbol: isFee ? FEE_SYMBOL : INTEREST_SYMBOL,
            tags: getTags()
        };
    }

    /**
     * Create the manual asset profile that Ghostfolio needs for a fixed fee or interest symbol.
     */
    private createAssetProfile(symbol: string, name: string): GhostfolioAssetProfile {
        return {
            assetClass: null,
            assetSubClass: null,
            comment: null,
            countries: [],
            currency: "GBP",
            cusip: null,
            dataSource: "MANUAL",
            figi: null,
            figiComposite: null,
            figiShareClass: null,
            holdings: [],
            isActive: true,
            isin: null,
            marketData: [],
            name: name,
            sectors: [],
            symbol: symbol,
            url: null
        };
    }

    /**
     * The closing balance of each day in the cash table.
     */
    private getBalances(records: VanguardUkRecord[]): { date: string, value: number }[] {

        const balances = new Map<string, number>();

        for (const record of records) {
            if (this.isBlankRecord(record)) {
                continue;
            }

            const [day, month, year] = record.date.split("/");
            balances.set(`${year}-${month}-${day}T00:00:00.000Z`, record.balance);
        }

        return Array.from(balances, ([date, value]) => ({ date, value }));
    }

    /**
     * Build the key that links a cash row to its row in the investment transactions table.
     */
    private getTradeKey(quantity: number, amount: number): string {
        return `${quantity}|${Math.abs(amount).toFixed(2)}`;
    }

    /**
     * Map trades (by quantity and cost) to the ticker in the investment transactions table, if the export has one.
     */
    private getTickersByTrade(lines: string[], searchFrom: number): Map<string, string> {

        const tickers = new Map<string, string>();

        const start = lines.findIndex((line, idx) => idx >= searchFrom && /^Date,InvestmentName,/i.test(line));
        if (start === -1) {
            return tickers;
        }

        let end = lines.findIndex((line, idx) => idx > start && /^Cost,/i.test(line));
        if (end === -1) {
            end = lines.length;
        }

        const records: VanguardUkInvestmentRecord[] = parseSync(lines.slice(start + 1, end).join("\n"), {
            delimiter: ",",
            relax_column_count: true,
            skip_empty_lines: true,
            columns: ["date", "investmentName", "transactionDetails", "quantity", "price", "cost"],
            cast: (columnValue, context) => {
                if (context.column === "quantity" || context.column === "price" || context.column === "cost") {
                    return columnValue === "" ? 0 : parseFloat(columnValue.replace(/,/g, ""));
                }

                return columnValue;
            }
        });

        for (const record of records) {
            const ticker = record.investmentName?.match(/\(([A-Z0-9]+)\)\s*$/)?.[1];

            if (ticker) {
                tickers.set(this.getTradeKey(record.quantity, record.cost), ticker);
            }
        }

        return tickers;
    }
}
