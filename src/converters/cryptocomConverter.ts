import dayjs from "dayjs";
import { parse } from "csv-parse";
import { CryptoComRecord } from "../models/cryptocomRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class CryptoComConverter extends AbstractConverter {

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

                // Convert transaction kinds to Ghostfolio types.
                if (context.column === "transactionKind") {
                    const type = columnValue.toLowerCase();

                    if (type.includes("crypto_exchange")) {
                        return "buy";
                    }
                    else if (type.includes("compound_interest") ||
                        type.includes("referral_card_cashback") ||
                        type.includes("stake_reward")) {
                        return "dividend";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "amount" ||
                    context.column === "toAmount" ||
                    context.column === "nativeAmount" ||
                    context.column === "nativeAmountInUSD") {

                    if (columnValue === "" || columnValue === undefined) {
                        return 0;
                    }

                    return Number.parseFloat(columnValue);
                }

                return columnValue;
            },
        }, async (err, records: CryptoComRecord[]) => {

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

                    const cryptoSymbol = `${record.currency}-${record.nativeCurrency}`;
                    let security: YahooFinanceRecord;

                    try {
                        // For crypto, we use the currency symbol directly instead of ISIN
                        security = await this.securityService.getSecurity(
                            null,
                            cryptoSymbol,
                            null,
                            null,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.currency, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.transactionKind} action for ${cryptoSymbol}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const quantity = Math.abs(record.amount);
                    const unitPrice = Math.abs(record.nativeAmount) / quantity;

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: 0,
                        quantity: quantity,
                        type: GhostfolioOrderType[record.transactionKind],
                        unitPrice: unitPrice,
                        currency: record.nativeCurrency,
                        dataSource: "YAHOO",
                        date: dayjs(record.timestampUTC).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: security.symbol
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
    public isIgnoredRecord(record: CryptoComRecord): boolean {
        let ignoredRecordTypes = ["deposit", "top_up", "lock", "transfer", "swap", "withdraw", "unlock"];

        return ignoredRecordTypes.some(t => record.transactionKind.toLowerCase().includes(t))
    }
}