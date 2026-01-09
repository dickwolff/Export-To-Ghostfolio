import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { RelaiRecord } from "../models/relaiRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class RelaiConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
    }

    /**
     * @inheritdoc
     */
    protected processHeaders(_: string): string[] {
        // Hardcoded header mapping from the Relai CSV export.
        // This ensures exact matching with RelaiRecord properties.
        return [
            "date",
            "transactionType",
            "btcAmount",
            "btcPrice",
            "currencyPair",
            "fiatAmountExclFees",
            "fiatCurrency",
            "fee",
            "feeCurrency",
            "destination",
            "operationId",
            "counterparty"
        ];
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

                // Convert transaction types to Ghostfolio type.
                if (context.column === "transactionType") {
                    const type = columnValue.toLocaleLowerCase();

                    if (type === "buy") {
                        return "buy";
                    }
                    else if (type === "sell") {
                        return "sell";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "btcAmount" ||
                    context.column === "btcPrice" ||
                    context.column === "fiatAmountExclFees" ||
                    context.column === "fee") {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: RelaiRecord[]) => {

            try {

                // Check if parsing failed...
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

                    // Relai only deals with Bitcoin
                    // Construct the symbol directly from the currency pair (e.g., BTC-CHF)
                    const currency = record.fiatCurrency;
                    let symbol = `BTC-${currency}`;

                    // Check if there's a symbol override configured
                    const overriddenSymbol = this.securityService.getSymbolOverride(symbol);
                    if (overriddenSymbol) {
                        symbol = overriddenSymbol;
                    }

                    // Calculate the unit price in the fiat currency
                    // BTC Price is already in the fiat currency (e.g., CHF/BTC)
                    const unitPrice = record.btcPrice;
                    const quantity = Math.abs(record.btcAmount);
                    const fee = record.fee;

                    // Add record to export.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: fee,
                        quantity: quantity,
                        type: GhostfolioOrderType[record.transactionType],
                        unitPrice: unitPrice,
                        currency: currency,
                        dataSource: "MANUAL",
                        date: dayjs(record.date).format("YYYY-MM-DDTHH:mm:ssZ"),
                        symbol: symbol,
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
    public isIgnoredRecord(record: RelaiRecord): boolean {
        // Relai doesn't have any records to ignore - all Buy and Sell transactions are relevant
        return false;
    }
}
