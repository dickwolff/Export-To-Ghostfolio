import dayjs from "dayjs";
import { parse } from "csv-parse";
import { getTags } from "../helpers/tagHelpers";
import { DisnatRecord } from "../models/disnatRecord";
import { AbstractConverter } from "./abstractconverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";

export class DisnatConverter extends AbstractConverter {

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

                // Convert transaction types to Ghostfolio types.
                if (context.column === "typeDeTransaction") {
                    const action = columnValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                    if (action.includes("frais") || action.includes("taxe") || action.includes("tax") || action.includes("retenue")) {
                        return "fee";
                    }
                    if (action.includes("achat")) {
                        return "buy";
                    }
                    else if (action.includes("vente")) {
                        return "sell";
                    }
                    else if (action.includes("dividende")) {
                        return "dividend";
                    }
                    else if (action.includes("interets")) {
                        return "interest";
                    }

                }

                // Parse numbers to floats (from string), handling French decimal format.
                if (context.column === "quantite" ||
                    context.column === "prix" ||
                    context.column === "montantDeLOperation" ||
                    context.column === "commissionPayee") {

                    if (columnValue === "" || columnValue === "-") {
                        return 0;
                    }

                    // Handle French number format (comma as decimal separator, quotes around numbers)
                    // eslint-disable-next-line prefer-string-replace-all
                    const cleanValue = columnValue.toString().replace(/"/g, "").replace(/,/g, ".");

                    return Number.parseFloat(cleanValue);
                }

                // Handle empty values for strings
                if (columnValue === "-") {
                    return "";
                }

                return columnValue;
            },
            on_record: (record: DisnatRecord) => {

                // Normalize currency codes
                if (record.deviseDuPrix === "CAN") {
                    record.currency = "CAD";
                } else if (record.deviseDuPrix === "US") {
                    record.currency = "USD";
                } else {
                    record.currency = record.deviseDuPrix || record.deviseDuCompte;
                }

                return record;
            }
        }, async (err, records: DisnatRecord[]) => {

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

                    const isFee = record.typeDeTransaction === "fee";
                    const isInterest = record.typeDeTransaction === "interest";

                    // Interest and fees don't have a security, so add those immediately.
                    if (isFee || isInterest) {

                        const amount = Math.abs(record.montantDeLOperation);

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: record.description,
                            fee: isFee ? amount : 0,
                            quantity: 1,
                            type: GhostfolioOrderType[record.typeDeTransaction],
                            unitPrice: isInterest ? amount : 0,
                            currency: record.currency,
                            dataSource: "MANUAL",
                            date: this.parseDate(record.dateDeReglement),
                            symbol: record.description || `${record.typeDeTransaction}-${record.symbole}`,
                            tags: getTags()
                        });

                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;

                    try {

                        // Some symbols are postfixed with -C for Canadian stocks, need to convert those to Yahoo Finance format (.TO).
                        let symbol = record.symbole;
                        if (symbol.endsWith("-C")) {
                            symbol = `${symbol.slice(0, -2)}.TO`;
                        }

                        security = await this.securityService.getSecurity(
                            null, // ISIN not provided in Disnat exports
                            symbol,
                            record.description,
                            record.currency,
                            null);
                    }
                    catch (err) {
                        this.logQueryError(record.description, idx + 2);
                        return errorCallback(err);
                    }

                    // Log whenever there was no match found.
                    if (!security) {
                        this.progress.log(`[i] No result found for ${record.typeDeTransaction} action for ${record.symbole ?? record.description} with currency ${record.currency}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const quantity = record.typeDeTransaction === "dividend" ? 1 : Math.abs(record.quantite);
                    const unitPrice = record.typeDeTransaction === "dividend" ? Math.abs(record.montantDeLOperation) : record.prix;

                    // Add record to export with Yahoo Finance data.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: Math.abs(record.commissionPayee || 0),
                        quantity: quantity,
                        type: GhostfolioOrderType[record.typeDeTransaction],
                        unitPrice: unitPrice,
                        currency: record.currency,
                        dataSource: "YAHOO",
                        date: this.parseDate(record.dateDeReglement),
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
    public isIgnoredRecord(record: DisnatRecord): boolean {

        // Ignore internal cash movements that don't represent actual trading activities
        const ignoredTypes = ["cotisation", "contribution", "transfert", "transfer", "subvention", "résiliation", "retrait", "incitatif"];
        const transactionType = record.typeDeTransaction?.toLowerCase();

        return ignoredTypes.some((t) => transactionType?.includes(t));
    }

    /**
     * @inheritdoc
     */
    public processHeaders(input: string): string[] {

        // Generic header mapping from the DISNAT CSV export.
        const csvHeaders = [
            "dateDeTransaction",
            "dateDeReglement",
            "typeDeTransaction",
            "classeDActif",
            "symbole",
            "description",
            "marche",
            "quantite",
            "prix",
            "deviseDuPrix",
            "commissionPayee",
            "montantDeLOperation",
            "deviseDuCompte"
        ];

        return csvHeaders;
    }

    /**
     * Parse Disnat date format to Ghostfolio format.
     * 
     * @param input The date string to parse.
     * @returns The formatted date string.
     */
    private parseDate(input: string): string {

        if (!input || input === "-") {
            return dayjs().format("YYYY-MM-DDTHH:mm:ssZ");
        }

        // Disnat uses YYYY-MM-DD format
        return dayjs(input).format("YYYY-MM-DDTHH:mm:ssZ");
    }
}