import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SecurityService } from "../securityService";
import { AbstractConverter } from "./abstractconverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { DirectaRecord } from "../models/directaRecord";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";

export class DirectaConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
        dayjs.extend(customParseFormat);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // skip first 9 first lines
        input = input.split("\n").slice(9).join("\n");

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: ",",
            fromLine: 2,
            columns: this.processHeaders(input),
            cast: (columnValue, context) => {
                // Convert actions to Ghostfolio type.
                if (context.column === "tipoOperazione") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.indexOf("acquisto") > -1) {
                        return "buy";
                    }
                    else if (action.indexOf("vendita") > -1) {
                        return "sell";
                    }
                    else if (["provento", "dividendi", "coupon"].some(t => action.toLocaleLowerCase().indexOf(t) > -1)) {
                        return "dividend";
                    }
                    else if (["commissioni", "rit.", "ritenuta", "ratei", "tobin tax"].some(t => action.toLocaleLowerCase().indexOf(t) > -1)) {
                        return "fee";
                    }
                    else if (action.indexOf("cedola") > -1) {
                        return "interest";
                    }
                }

                // Parse numbers to floats (from string).
                if (context.column === "quantit" ||
                    context.column === "importoEuro" ||
                    context.column === "importoDivisa") {

                    return Math.abs(parseFloat(columnValue) || 0);
                }

                return columnValue;
            }
        }, async (err, records: DirectaRecord[]) => {

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

                // Check if the record should be ignored.
                if (this.isIgnoredRecord(record)) {
                    bar1.increment();
                    continue;
                }

                if (!record.dataValuta) {
                    this.progress.log(`[i] No date found for record ${idx + 2}! Skipping..\n`);
                    bar1.increment();
                    continue;
                }

                if (!record.tipoOperazione || !GhostfolioOrderType[record.tipoOperazione]) {
                    this.progress.log(`[i] No operation type found for record ${idx + 2}! Skipping..\n`);
                    bar1.increment();
                    continue;
                }

                if (!record.isin && !record.ticker) {
                    this.progress.log(`[i] No ISIN or ticker found for record ${idx + 2}! Skipping..\n`);
                    bar1.increment();
                    continue;
                }

                let security;
                try {
                    security = await this.securityService.getSecurity(
                        record.isin,
                        record.ticker,
                        record.descrizione,
                        record.divisa,
                        this.progress);
                }
                catch (err) {
                    this.logQueryError(record.isin || record.ticker, idx + 2);
                    return errorCallback(err);
                }

                // Log whenever there was no match found.
                if (!security) {
                    this.progress.log(`[i] No result found for ${record.tipoOperazione} action for ${record.isin || record.ticker} with currency ${record.divisa}! Please add this manually..\n`);
                    bar1.increment();
                    continue;
                }

                const activity = this.createActivity(record, security);
                if (activity) {
                    result.activities.push(activity);
                }

                bar1.increment();
            }

            this.progress.stop()

            successCallback(result);
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: any): boolean {
        let ignoredRecordTypes = ["conferimento", "bonifico", "finanziamento", "bollo", "prelievo"];
        return ignoredRecordTypes.some(t => record.tipoOperazione.toLocaleLowerCase().indexOf(t) > -1)
    }

    private createActivity(record: DirectaRecord, security: YahooFinanceRecord): GhostfolioActivity {
        const date = dayjs(record.dataValuta, "DD-MM-YYYY");

        let quantity = 0, unitPrice = 0, fee = 0;

        let bondDescriptions = ["cdp obb", "romania", "btp"];
        const isBond = bondDescriptions.some(t => record.descrizione.toLowerCase().indexOf(t) > -1);

        switch (record.tipoOperazione) {
            case "dividend":
            case "interest":
                quantity = 1;
                unitPrice = Math.abs(record.importoEuro);
                break;
            case "fee":
                quantity = 1;
                fee = Math.abs(record.importoEuro);
                break;
            default:
                if (isBond) {
                    unitPrice = (record.importoEuro / Number(record.quantit)) * 100;
                    quantity = Number(record.quantit) / 100;
                } else {
                    quantity = Number(record.quantit);
                    unitPrice = record.importoEuro / quantity;
                }
                break;
        }

        // Add record to export.
        return {
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: record.descrizione,
            fee: fee,
            quantity: quantity,
            type: GhostfolioOrderType[record.tipoOperazione],
            unitPrice: unitPrice,
            currency: security.currency ?? record.divisa,
            dataSource: "YAHOO",
            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
            symbol: security.symbol
        };
    }
}
