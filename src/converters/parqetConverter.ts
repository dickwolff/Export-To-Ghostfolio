import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SecurityService } from "../securityService";
import { ParqetRecord } from "../models/parqetRecord";
import { AbstractConverter } from "./abstractconverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class ParqetConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ";",
            fromLine: 2,
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {

                // Custom mapping below.

                if ((context.column === "currency" || context.column === "originalCurrency") && columnValue === "GBP") {
                    return "GBp";
                }

                // Parse numbers to floats (from string).
                if (context.column === "price" ||
                    context.column === "shares" ||
                    context.column === "amount" ||
                    context.column === "tax" ||
                    context.column === "fee" ||
                    context.column === "realizedGains" ||
                    context.column === "fxRate") {

                    // If column is fxRate or realizedGains and empty, just return 0.
                    if ((context.column === "fxRate" || context.column === "realizedGains") && `${columnValue}` === "") {
                        return 0;
                    }

                    return parseFloat(columnValue.replace(",", "."));
                }

                return columnValue;
            }
        }, async (err, records: ParqetRecord[]) => {

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

                let security: YahooFinanceRecord;
                try {
                    security = await this.securityService.getSecurity(
                        record.identifier,
                        null,
                        record.holdingName,
                        record.currency ?? record.originalCurrency,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.identifier || record.holdingName, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.type.toLocaleLowerCase()} action for ${record.identifier || record.holdingName}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                const fees = Math.abs(record.tax) + Math.abs(record.fee);

                // Add record to export.
                result.activities.push({
                    accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                    comment: "",
                    fee: fees,
                    quantity: record.shares,
                    type: GhostfolioOrderType[record.type.toLocaleLowerCase()],
                    unitPrice: record.price,
                    currency: record.currency ?? record.originalCurrency,
                    dataSource: "YAHOO",
                    date: dayjs(record.dateTime).format("YYYY-MM-DDTHH:mm:ssZ"),
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
    protected processHeaders(_: string): string[] {

        // Generic header mapping from the Parqet CSV export.
        const csvHeaders = [
            "dateTime",
            "date",
            "time",
            "price",
            "shares",
            "amount",
            "tax",
            "fee",
            "realizedGains",
            "type",
            "broker",
            "assetType",
            "identifier",
            "wkn",
            "originalCurrency",
            "currency",
            "fxRate",
            "holding",
            "holdingName",
            "holdingNickname",
            "exchange",
            "avgHoldingPeriod"];

        return csvHeaders;
    }

    /**
     * @inheritdoc
     * 
     * Ignore this method, as there are no ignored records for Parqet.
     */
    /* istanbul ignore next */
    public isIgnoredRecord(record: ParqetRecord): boolean {
        let ignoredRecordTypes = ["transferin", "transferout"];

        return ignoredRecordTypes.some(t => record.type.toLocaleLowerCase().indexOf(t) > -1)
    }
}
