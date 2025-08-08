import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { InvestimentalRecord } from "../models/investimentalRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class InvestimentalConverter extends AbstractConverter {

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
            cast: (columnValue, context) => {

                // Custom mapping below.

                // Convert type to Ghostfolio type.
                if (context.column === "side") {
                    return columnValue.toLowerCase();
                }

                // Parse numbers to floats (from string).
                if (
                    context.column === "price" ||
                    context.column === "fee" ||
                    context.column === "volume" ||
                    context.column === "value"
                ) {
                    return parseFloat(columnValue);
                }

                return columnValue;
            }
        }, async (err, records: InvestimentalRecord[]) => {

            try {

                if (err) {
                    console.log(err);
                }

                // If records is empty, parsing failed..
                if (records === undefined || records.length === 0) {
                    return errorCallback(new Error("An error occurred while parsing!"));
                }

                console.log("[i] Read CSV file. Start processing..");
                const result: GhostfolioExport = {
                    meta: {
                        date: new Date(),
                        version: "v0"
                    },
                    activities: []
                }

                // Group records by orderID
                const orderGroups = this.groupRecordsByorderID(records);

                // Populate the progress bar.
                const bar1 = this.progress.create(orderGroups.size, 0);

                for (const [orderID, orderRecords] of orderGroups) {
                    const combinedRecord = this.combineRecords(orderRecords);

                    if (combinedRecord) {

                        const currency = this.extractCurrency(combinedRecord.accountName);

                        if (!currency) {
                            this.progress.log(`[i] Could not determine currency for order ${orderID}. Skipping...\n`);
                            bar1.increment();
                            continue;
                        }

                        let security: YahooFinanceRecord;
                        try {
                            security = await this.securityService.getSecurity(
                                null,
                                combinedRecord.symbol,
                                null,
                                currency,
                                this.progress);
                        }
                        catch (err) {
                            return errorCallback(err);
                        }

                        if (!security) {
                            this.progress.log(`[i] No result found for action ${combinedRecord.side}, symbol ${combinedRecord.symbol}, currency ${currency}! Please add this manually..\n`);
                            bar1.increment();
                            continue;
                        }

                        const activity = this.createActivity(combinedRecord, security);
                        if (activity) {
                            result.activities.push(activity);
                        }
                    }

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
    public isIgnoredRecord(record: InvestimentalRecord): boolean {
        // Ignore Out Of Time records
        return record.updateType === "OOT";
    }

    private groupRecordsByorderID(records: InvestimentalRecord[]): Map<string, InvestimentalRecord[]> {
        const orderGroups = new Map<string, InvestimentalRecord[]>();

        for (const record of records) {
            if (this.isIgnoredRecord(record)) {
                continue;
            }
            if (!orderGroups.has(record.orderID)) {
                orderGroups.set(record.orderID, []);
            }
            orderGroups.get(record.orderID)!.push(record);
        }

        return orderGroups;
    }

    private combineRecords(orderRecords: InvestimentalRecord[]): InvestimentalRecord | null {
        orderRecords.sort((a, b) => new Date(a.updateTime).getTime() - new Date(b.updateTime).getTime());

        let remainingVolume = 0;
        let executedVolume = 0;
        let totalValue = 0;
        let lastFee = 0;
        let lastPrice = 0;

        for (const record of orderRecords) {
            if (record.updateType === "Fil") {
                let newlyExecutedVolume = remainingVolume - record.volume;
                if (record.status === "Inactive") {
                    newlyExecutedVolume = record.volume;
                }
                executedVolume += newlyExecutedVolume;
                totalValue += newlyExecutedVolume * (record.price || lastPrice);
            }

            if (record.updateType === "New" || record.updateType === "Chg") {
                lastFee = record.fee || lastFee;
            }
            lastPrice = record.price || lastPrice;
            remainingVolume = record.volume;
        }

        const lastRecord = orderRecords[orderRecords.length - 1];

        if (executedVolume > 0) {
            const averagePrice = totalValue > 0 ? Number((totalValue / executedVolume).toFixed(4)) : lastPrice;
            return {
                ...lastRecord,
                volume: executedVolume,
                price: averagePrice,
                fee: lastFee,
            };
        }

        return null;
    }

    private createActivity(record: InvestimentalRecord, security: YahooFinanceRecord): GhostfolioActivity {
        const date = dayjs(record.updateTime, "YYYY-MM-DD HH:mm:ss");

        return {
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: "",
            fee: record.fee,
            quantity: record.volume,
            type: GhostfolioOrderType[record.side.toLowerCase()],
            unitPrice: record.price,
            currency: security.currency,
            dataSource: "YAHOO",
            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
            symbol: security.symbol,
        };
    }

    private extractCurrency(accountName: string): string | null {
        const match = accountName.match(/\[(\w+)\]/);
        return match ? match[1] : null;
    }
}
