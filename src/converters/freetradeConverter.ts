import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { FreetradeRecord } from "../models/freetradeRecord";
import { YahooFinanceRecord } from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class FreetradeConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
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
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("interest_from_cash") > -1) {
                        return "interest";
                    }
                }

                if (context.column == "totalAmount" ||
                    context.column == "pricePerShareInAccountCurrency" ||
                    context.column == "stampDuty" ||
                    context.column == "quantity" ||
                    context.column == "totalSharesAmount" ||
                    context.column == "pricePerShare" ||
                    context.column == "fxRate" ||
                    context.column == "baseFxRate" ||
                    context.column == "fXFeeBps" ||
                    context.column == "fXFeeAmount" ||
                    context.column == "dividendEligibleQuantity" ||
                    context.column == "dividendAmountPerShare" ||
                    context.column == "dividendGrossDistributionAmount" ||
                    context.column == "dividendNetDistributionAmount" ||
                    context.column == "dividendWithheldTaxPercentage" ||
                    context.column == "dividendWithheldTaxAmount"
                  ) {
                      if (columnValue === null || columnValue === "") {
                        columnValue = "0";
                      }
                      return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (_, records: FreetradeRecord[]) => {
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

                // Interest does not have a security, so add those immediately.
                if (record.type.toLocaleLowerCase() === "interest") {

                    // Add fees record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: record.title,
                        fee: 0,
                        quantity: 1,
                        type: GhostfolioOrderType["interest"],
                        unitPrice: record.totalAmount,
                        currency: record.accountCurrency,
                        dataSource: "MANUAL",
                        date: dayjs(record.timestamp).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: record.title
                    });

                    bar1.increment();
                    continue;
                }

                let security: YahooFinanceRecord;
                try {
                    security = await this.yahooFinanceService.getSecurity(
                        record.isin,
                        record.ticker,
                        null,
                        record.instrumentCurrency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.ticker || record.isin, idx + 2);
                    return errorCallback(err);
                }

                var action
                if (record.type.toLocaleLowerCase() === "dividend") {
                    action = "dividend";
                }

                if (record.type.toLocaleLowerCase() === "order") {
                  action = record.buySell.toLocaleLowerCase();
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${action} action for ${record.isin || record.ticker} with currency ${record.instrumentCurrency}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                // Add record to export.
                if (action === "dividend") {
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: record.title,
                        fee: record.dividendWithheldTaxAmount,
                        quantity: record.dividendEligibleQuantity,
                        type: GhostfolioOrderType[action],
                        unitPrice: record.dividendAmountPerShare,
                        currency: record.instrumentCurrency,
                        dataSource: "YAHOO",
                        date: dayjs(record.dividendPayDate).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: security.symbol
                    });

                    bar1.increment();
                    continue;
                }
                // Buy & Sell
                const feeAmount = record.stampDuty + record.fXFeeAmount;
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: record.title,
                    fee: feeAmount,
                    quantity: record.quantity,
                    type: GhostfolioOrderType[action],
                    unitPrice: record.pricePerShare,
                    currency: record.instrumentCurrency,
                    dataSource: "YAHOO",
                    date: dayjs(record.timestamp).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: FreetradeRecord): boolean {
        let ignoredRecordTypes = ["withdraw", "monthly_statement", "top_up"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
