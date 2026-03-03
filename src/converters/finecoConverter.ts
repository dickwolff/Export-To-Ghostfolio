import dayjs from "dayjs";
import { parse } from "csv-parse";
import { SecurityService } from "../securityService";
import { AbstractConverter } from "./abstractconverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { FinecoRecord } from "../models/finecoRecord";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { getTags } from "../helpers/tagHelpers";

export class FinecoConverter extends AbstractConverter {

    constructor(securityService: SecurityService) {
        super(securityService);
        dayjs.extend(customParseFormat);
    }

    /**
     * @inheritdoc
     */
    public processFileContents(input: string, successCallback: any, errorCallback: any): void {

        // Skip preamble lines until the actual CSV header.
        const lines = input.split("\n");
        const headerIndex = lines.findIndex(line => {
            const lower = line.toLocaleLowerCase();
            return lower.includes("operazione") && lower.includes("data valuta") && lower.includes("descrizione");
        });

        if (headerIndex === -1) {
            return errorCallback(new Error("Could not find header row in input file!"));
        }

        // Detect delimiter from header line (semicolon for Italian locale, comma otherwise).
        const headerLine = lines[headerIndex];
        const delimiter = headerLine.includes(";") ? ";" : ",";

        input = lines.slice(headerIndex).join("\n");

        // Parse the CSV and convert to Ghostfolio import format.
        parse(input, {
            delimiter: delimiter,
            fromLine: 2,
            columns: this.processHeaders(input, delimiter),
            cast: (columnValue, context) => {

                // Trim whitespace from all values (Fineco exports may have trailing spaces).
                columnValue = columnValue.trim();

                // Parse numbers to floats (from string).
                if (["quantita", "prezzo", "cambio", "controvalore",
                    "commissioniFondiSwIngrUscita", "commissioniFondiBancaCorrispondente",
                    "speseFondiSgr", "commissioniAmministrato"].includes(context.column as string)) {

                    if (delimiter === ";") {
                        // Semicolon delimiter: dots are thousand separators, comma is decimal.
                        columnValue = columnValue.replace(/\./g, "").replace(",", ".");
                    } else {
                        // Comma delimiter: commas inside quoted values are thousand separators.
                        columnValue = columnValue.replace(/,/g, "");
                    }

                    return Math.abs(parseFloat(columnValue) || 0);
                }

                return columnValue;
            }
        }, async (err, records: FinecoRecord[]) => {

            try {

                // Check if parsing failed.
                if (err || records === undefined || records.length === 0) {
                    let errorMsg = "An error occurred while parsing!";

                    if (err) {
                        errorMsg += ` Details: ${err.message}`;
                    }

                    return errorCallback(new Error(errorMsg));
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

                    // Determine Ghostfolio order type from descrizione + segno.
                    const orderType = this.getOrderType(record);
                    if (!orderType) {
                        this.progress.log(`[i] Unknown operation type '${record.descrizione}' with sign '${record.segno}' for record ${idx + 2}! Skipping..\n`);
                        bar1.increment();
                        continue;
                    }

                    if (!record.dataValuta) {
                        this.progress.log(`[i] No date found for record ${idx + 2}! Skipping..\n`);
                        bar1.increment();
                        continue;
                    }

                    if (!record.isin) {
                        this.progress.log(`[i] No ISIN found for record ${idx + 2}! Skipping..\n`);
                        bar1.increment();
                        continue;
                    }

                    // When an ISIN override exists, skip currency matching:
                    // Fineco reports EUR (Borsa Italiana settlement) but
                    // the override symbol may be listed in USD/GBP on Yahoo.
                    const hasOverride = this.securityService.getSymbolOverride(record.isin);
                    const expectedCurrency = hasOverride ? null : record.divisa;

                    let security;
                    try {
                        security = await this.securityService.getSecurity(
                            record.isin,
                            null,
                            record.titolo,
                            expectedCurrency,
                            this.progress);
                    }
                    catch (err) {
                        this.logQueryError(record.isin, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${orderType} action for ${record.isin} with currency ${record.divisa}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const activity = this.createActivity(record, security, orderType);
                    if (activity) {
                        result.activities.push(activity);
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
    public isIgnoredRecord(record: any): boolean {
        if (!record.descrizione) return true;
        return false;
    }

    private getOrderType(record: FinecoRecord): string | null {
        const desc = record.descrizione.toLocaleLowerCase();

        if (desc === "compravendita titoli") {
            if (record.segno === "A") return "buy";
            if (record.segno === "V") return "sell";
            return null;
        }

        if (desc === "dividendo") return "dividend";
        if (desc === "stacco cedole") return "interest";

        // Stock split, spinoff, or capital raise — new shares received.
        if (desc === "aumento capitale") return "buy";

        // Bond maturity or equity delisting — principal/shares returned.
        if (desc === "rimborso") return "sell";

        return null;
    }

    private createActivity(record: FinecoRecord, security: YahooFinanceRecord, orderType: string): GhostfolioActivity {
        const date = dayjs(record.dataValuta, "DD/MM/YYYY");

        let quantity = 0, unitPrice = 0;

        // Calculate total fee from all commission columns.
        const fee = (record.commissioniAmministrato || 0) +
            (record.commissioniFondiSwIngrUscita || 0) +
            (record.commissioniFondiBancaCorrispondente || 0) +
            (record.speseFondiSgr || 0);

        const bondKeywords = ["btp", "bot", "cct", "obbligazione"];
        const isBond = bondKeywords.some(t => record.titolo.toLowerCase().indexOf(t) > -1);

        const desc = record.descrizione.toLocaleLowerCase();

        switch (orderType) {
            case "dividend":
            case "interest":
                if (record.quantita) {
                    quantity = isBond ? record.quantita / 100 : record.quantita;
                    unitPrice = Math.abs(record.controvalore) / quantity;
                } else {
                    quantity = 1;
                    unitPrice = Math.abs(record.controvalore);
                }
                break;
            case "buy":
            case "sell":
                if (desc === "rimborso" && isBond) {
                    // Bond maturity: Fineco reports quantita as nominal (e.g. 250000)
                    // and prezzo as percentage of par (e.g. 100).
                    quantity = record.quantita / 100;
                    unitPrice = record.prezzo;
                } else if (isBond) {
                    unitPrice = (record.controvalore / record.quantita) * 100;
                    quantity = record.quantita / 100;
                } else {
                    quantity = record.quantita;
                    unitPrice = record.prezzo;
                }
                break;
        }

        return {
            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
            comment: record.isin ? `${record.titolo} [${record.isin}]` : record.titolo,
            fee: fee,
            quantity: quantity,
            type: GhostfolioOrderType[orderType],
            unitPrice: unitPrice,
            currency: security.currency ?? record.divisa,
            dataSource: "YAHOO",
            date: date.format("YYYY-MM-DDTHH:mm:ssZ"),
            symbol: security.symbol,
            tags: getTags()
        };
    }
}
