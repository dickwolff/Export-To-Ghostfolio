import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { UbsRecord } from "../models/ubsRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { getTags } from "../helpers/tagHelpers";

export class UbsConverter extends AbstractConverter {

    // The UBS e-banking "Transaktionsliste" export has a fixed column layout.
    // Explicit column names are used because the German headers contain
    // duplicate names ("Whrg." appears twice), umlauts and dots.
    private csvColumns = [
        "valuationDate",
        "bankRelation",
        "portfolio",
        "product",
        "tradeDate",
        "tradeTime",
        "bookingDate",
        "valueDate",
        "description1",
        "description2",
        "description3",
        "valor",
        "isin",
        "nominalCurrency",
        "quantity",
        "currency",
        "transactionPrice",
        "exchangeRate",
        "valuationCurrency",
        "transactionValue",
        "accruedInterest",
        "realizedProfitPercentage",
        "realizedProfit",
        "orderNumber",
        "externalReference",
        "assetClass",
        "subAssetClass",
        "instrumentCategory"
    ];

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
            columns: this.csvColumns,
            relax_column_count: true,
            bom: true,
            cast: (columnValue, context) => {

                // Parse numbers to floats (from string). UBS uses the Swiss
                // thousands separator (') which needs to be removed first.
                if (context.column === "quantity" ||
                    context.column === "transactionPrice" ||
                    context.column === "exchangeRate" ||
                    context.column === "transactionValue") {
                    return parseFloat(columnValue.replace(/'/g, ""));
                }

                return columnValue;
            }
        }, async (err, records: UbsRecord[]) => {

            try {

                // Check if parsing failed..
                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error occurred while parsing!";

                    if (err) {
                        errorMsg += ` Details: ${err.message}`
                    }

                    return errorCallback(new Error(errorMsg))
                }

                console.log("Read CSV file. Start processing..");
                const result: GhostfolioExport = {
                    meta: {
                        date: new Date(),
                        version: "v0"
                    },
                    activities: []
                }

                // Net out cancelled orders. A cancellation ("Storno") appears as an
                // extra record with a negative quantity and the same order reference
                // as the original booking (which is then usually re-booked with a
                // corrected date). Remove each Storno record together with the first
                // matching original record so only the effective booking remains.
                const stornoRecords = records.filter(record => record.quantity < 0);
                for (const storno of stornoRecords) {
                    const originalIdx = records.findIndex(record =>
                        record.quantity > 0 &&
                        record.isin === storno.isin &&
                        record.externalReference === storno.externalReference &&
                        record.quantity === Math.abs(storno.quantity));

                    if (originalIdx > -1) {
                        this.progress.log(`[i] Removing cancelled order ${storno.externalReference} for ${storno.isin} (Storno)..\n`);
                        records.splice(originalIdx, 1);
                    }

                    records.splice(records.indexOf(storno), 1);
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

                    const orderType = this.mapOrderType(record);

                    // Skip record types that are not supported (yet).
                    if (!orderType) {
                        this.progress.log(`[i] Unsupported transaction type "${record.description1}; ${record.description2}" (line ${idx + 2}), skipping..\n`);
                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;
                    try {
                        security = await this.securityService.getSecurity(
                            record.isin,
                            null,
                            record.description2,
                            record.currency,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.isin, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.description1} action for ${record.isin} with currency ${record.currency}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const date = dayjs(`${record.tradeDate}`, "DD.MM.YYYY");

                    // Add record to export. The UBS export does not carry a
                    // separate costs column, so the fee is always 0.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: null,
                        fee: 0,
                        quantity: record.quantity,
                        type: GhostfolioOrderType[orderType],
                        unitPrice: record.transactionPrice,
                        currency: record.currency,
                        dataSource: "YAHOO",
                        date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
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
    public isIgnoredRecord(record: UbsRecord): boolean {

        // Ignore cash movements (deposits, withdrawals) and any row without an
        // ISIN (e.g. the report footer line).
        return !record.isin || record.product?.toLocaleLowerCase() === "cash";
    }

    private mapOrderType(record: UbsRecord): string | null {

        const description = `${record.description1} ${record.description2}`.toLocaleLowerCase();

        // Check sell before buy, because "verkauf" contains "kauf".
        if (description.indexOf("verkauf") > -1 || description.indexOf("rücknahme") > -1) {
            return "sell";
        }
        else if (description.indexOf("kauf") > -1 || description.indexOf("zeichnung") > -1) {
            return "buy";
        }

        return null;
    }
}
