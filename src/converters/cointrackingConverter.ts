import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { CointrackingRecord } from "../models/cointrackingRecord";

export class CointrackingConverter extends AbstractConverter {

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

                // Parse numbers to floats (from string).
                if (context.column === "buy" ||
                    context.column === "sell" ||
                    context.column === "fee") {
                    if (columnValue === "") {
                        return 0;
                    }

                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: CointrackingRecord[]) => {

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

                    let action = record.type.toLocaleLowerCase() === "staking" ? "dividend" : "buy";
                    let quantity = record.buy;
                    let price = record.sell;
                    let fee = record.fee;

                    let security: YahooFinanceRecord;

                    // Find the security for the trade. First look for the BUY-SELL pair.
                    try {
                        security = await this.securityService.getSecurity(
                            null,
                            `${record.currencyBuy}-${action === "dividend" ? record.currencyFee : record.currencySell}`,
                            null,
                            null,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(`${record.currencyBuy}-${action === "dividend" ? record.currencyFee : record.currencySell}`, idx + 2);
                        return errorCallback(err);
                    }

                    // Check if there was no match found. If so, try the reverse pair.
                    if (!security) {

                        // If the currency pair is reverse, it's a sell action. 
                        action = "sell";
                        quantity = record.sell;
                        price = record.buy;

                        this.progress.log(`[i] No result found trade with currency ${record.currencyBuy}-${record.currencySell}! Looking for reverse..\n`);
                        try {
                            security = await this.securityService.getSecurity(
                                null,
                                `${action === "dividend" ? record.currencyFee : record.currencySell}-${record.currencyBuy}`,
                                null,
                                null,
                                this.progress);
                        }
                        catch (err) {
                            this.logQueryError(`${action === "dividend" ? record.currencyFee : record.currencySell}-${record.currencyBuy}`, idx + 2);
                            return errorCallback(err);
                        }
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found trade with currency ${record.currencyBuy}-${action === "dividend" ? record.currencyFee : record.currencySell}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const unitPrice = price / quantity;

                    // Overide action for staking records.

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: fee,
                        quantity: quantity,
                        type: GhostfolioOrderType[action],
                        unitPrice: action === "dividend" ? 1 : unitPrice,
                        currency: security.currency,
                        dataSource: "YAHOO",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the CoinTracking CSV export.
        const csvHeaders = [
            "type",
            "buy",
            "currencyBuy",
            "sell",
            "currencySell",
            "fee",
            "currencyFee",
            "exchange",
            "group",
            "comment",
            "date",
            "txId"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: CointrackingRecord): boolean {
        let ignoredRecordTypes = ["deposit", "withdrawal"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
