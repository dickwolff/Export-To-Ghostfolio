import dayjs from "dayjs";
import { parse } from "csv-parse";
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
                if (context.column === "type") {
                    const action = columnValue.toLocaleLowerCase();

                    if (action.includes("achat") || action.includes("buy")) {
                        return "buy";
                    }
                    else if (action.includes("vente") || action.includes("sell")) {
                        return "sell";
                    }
                    else if (action.includes("dividende") || action.includes("dividend")) {
                        return "dividend";
                    }
                    else if (action.includes("intérêts") || action.includes("interet") || action.includes("interest")) {
                        return "interest";
                    }
                    else if (action.includes("frais") || action.includes("taxe") || action.includes("fee") || action.includes("tax")) {
                        return "fee";
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

                    const isFee = record.type === "fee";
                    const isInterest = record.type === "interest";

                    // Interest and fees don't have a security, so add those immediately.
                    if (isFee || isInterest) {

                        const amount = Math.abs(record.montantDeLOperation);

                        result.activities.push({
                            accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                            comment: record.description,
                            fee: isFee ? amount : 0,
                            quantity: 1,
                            type: GhostfolioOrderType[record.type],
                            unitPrice: isInterest ? amount : 0,
                            currency: record.currency,
                            dataSource: "MANUAL",
                            date: this.parseDate(record.dateDeReglement),
                            symbol: record.description || `${record.typeDeTransaction}-${record.symbole}`
                        });

                        bar1.increment();
                        continue;
                    }

                    let security: YahooFinanceRecord;

                    try {
                        security = await this.securityService.getSecurity(
                            null, // ISIN not provided in Disnat exports
                            record.symbole,
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
                        this.progress.log(`[i] No result found for ${record.type} action for ${record.isin}! Please add this manually..\n`);
                        bar1.increment();
                        continue;
                    }

                    const quantity = record.type === "dividend" ? 1 : Math.abs(record.quantite);
                    const unitPrice = record.type === "dividend" ? Math.abs(record.montantDeLOperation) : record.prix;

                    // Add record to export with Yahoo Finance data.
                    result.activities.push({
                        accountId: process.env.GHOSTFOLIO_ACCOUNT_ID,
                        comment: "",
                        fee: record.commissionPayee || 0,
                        quantity: quantity,
                        type: GhostfolioOrderType[record.type],
                        unitPrice: unitPrice,
                        currency: record.currency,
                        dataSource: "YAHOO",
                        date: this.parseDate(record.dateDeReglement),
                        symbol: security.symbol
                    });

                    bar1.increment();
                }

                this.progress.stop();

                successCallback(result);

            } catch (error) {
                return errorCallback(error);
            }
        });
    }

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: DisnatRecord): boolean {

        // Ignore internal cash movements that don't represent actual trading activities
        const ignoredTypes = ["cotisation", "contribution", "transfert", "transfer", "subvention", "résiliation", "retrait"];
        const transactionType = record.typeDeTransaction?.toLowerCase();

        return ignoredTypes.some((t) => transactionType?.includes(t));
    }

    /**
     * @inheritdoc
     */
    public processHeaders(input: string): string[] {

        // Read first line and extract headers.
        const lines = input.split("\n");

        if (lines.length === 0) {
            throw new Error("Invalid CSV format!");
        }

        const columns = lines[0].split(",");

        // Map French headers to English property names
        const headerMappings = {
            "Date de transaction": "dateDeTransaction",
            "Date de règlement": "dateDeReglement",
            "Type de transaction": "typeDeTransaction",
            "Classe d'actif": "classeDActif",
            "Symbole": "symbole",
            "Description": "description",
            "Marché": "marche",
            "Quantité": "quantite",
            "Prix": "prix",
            "Devise du prix": "deviseDuPrix",
            "Commission payée": "commissionPayee",
            "Montant de l'opération": "montantDeLOperation",
            "Devise du compte": "deviseDuCompte"
        };

        const processedHeaders = [];

        for (const column of columns) {
            // eslint-disable-next-line prefer-string-replace-all
            const trimmedColumn = column.trim().replace(/"/g, "");

            if (headerMappings[trimmedColumn]) {
                processedHeaders.push(headerMappings[trimmedColumn]);
            } else {
                // Fallback for unmapped headers
                // eslint-disable-next-line prefer-string-replace-all
                processedHeaders.push(trimmedColumn.toLowerCase().replace(/\s+/g, ""));
            }
        }

        // Add 'type' column for processed transaction type
        processedHeaders.push("type");

        return processedHeaders;
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