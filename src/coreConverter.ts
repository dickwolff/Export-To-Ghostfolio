import dayjs from "dayjs";
import { SecurityService } from "./securityService";
import { AbstractConverter } from "./converters/abstractconverter";
import { AvanzaConverter } from "./converters/avanzaConverter";
import { BitvavoConverter } from "./converters/bitvavoConverter";
import { BuxConverter } from "./converters/buxConverter";
import { CoinbaseConverter } from "./converters/coinbaseConverter";
import { CointrackingConverter } from "./converters/cointrackingConverter";
import { CryptoComConverter } from "./converters/cryptocomConverter";
import { DeGiroConverter } from "./converters/degiroConverter";
import { DeGiroConverterV2 } from "./converters/degiroConverterV2";
import { DeGiroConverterV3 } from "./converters/degiroConverterV3";
import { DeltaConverter } from "./converters/deltaConverter";
import { DirectaConverter } from "./converters/directaConverter";
import { DisnatConverter } from "./converters/disnatConverter";
import { EtoroConverter } from "./converters/etoroConverter";
import { FinpensionConverter } from "./converters/finpensionConverter";
import { FreetradeConverter } from "./converters/freetradeConverter";
import { GhostfolioExport } from "./models/ghostfolioExport";
import { IbkrConverter } from "./converters/ibkrConverter";
import { InvestEngineConverter } from "./converters/investEngineConverter";
import { InvestimentalConverter } from "./converters/investimentalConverter";
import { ParqetConverter } from "./converters/parqetConverter";
import { RabobankConverter } from "./converters/rabobankConverter";
import { RelaiConverter } from "./converters/relaiConverter";
import { RevolutConverter } from "./converters/revolutConverter";
import { SaxoConverter } from "./converters/saxoConverter";
import { SchwabConverter } from "./converters/schwabConverter";
import { SwissquoteConverter } from "./converters/swissquoteConverter";
import { TradeRepublicConverter } from "./converters/tradeRepublicConverter";
import { Trading212Converter } from "./converters/trading212Converter";
import { XtbConverter } from "./converters/xtbConverter";

import packageInfo from "../package.json";

export interface ConversionOptions {
    /** Override the GHOSTFOLIO_ACCOUNT_ID environment variable */
    accountId?: string;
    /** Override the GHOSTFOLIO_TAG_IDS environment variable (comma-separated UUIDs or array) */
    tagIds?: string | string[];
    /** Enable debug logging (pretty print JSON) */
    debugLogging?: boolean;
    /** Update cash balance in Ghostfolio */
    updateCashBalance?: boolean;
    /** Split output into chunks of 25 activities */
    splitOutput?: boolean;
}

export interface ConversionResult {
    /** The Ghostfolio export objects (may be multiple if split) */
    exports: GhostfolioExport[];
    /** Total number of activities processed */
    totalActivities: number;
}


/**
 * Create a converter instance for the given converter type.
 *
 * @param converterType The type of converter to create (e.g., "trading212", "degiro")
 * @param securityService Optional security service instance
 * @returns The converter instance
 */
export async function createConverter(converterType: string, securityService?: SecurityService): Promise<AbstractConverter> {

    // If no security service is provided, create a new one.
    if (!securityService) {
        securityService = new SecurityService();
    }

    const cacheSize = await securityService.loadCache();
    console.log(`[i] Restored ${cacheSize[0]} ISIN-symbol pairs and ${cacheSize[1]} symbols from cache..`);

    let converter: AbstractConverter;

    switch (converterType) {

        case "avanza":
            console.log("[i] Processing file using Avanza converter");
            converter = new AvanzaConverter(securityService);
            break;
        case "bv":
        case "bitvavo":
            console.log("[i] Processing file using Bitvavo converter");
            converter = new BitvavoConverter(securityService);
            break;
        case "bux":
            console.log("[i] Processing file using Bux converter");
            converter = new BuxConverter(securityService);
            break;
        case "cb":
        case "coinbase":
            console.log("[i] Processing file using Coinbase converter");
            converter = new CoinbaseConverter(securityService);
            break;
        case "ct":
        case "cointracking":
            console.log("[i] Processing file using CoinTracking converter");
            converter = new CointrackingConverter(securityService);
            break;
        case "cryptocom":
            console.log("[i] Processing file using Crypto.com converter");
            converter = new CryptoComConverter(securityService);
            break;
        case "degiro-v1":
            console.log("[i] Processing file using DeGiro converter (V1)");
            console.log("[i] NOTE: This version of the DeGiro converter is deprecated and will no longer receive updates.");
            converter = new DeGiroConverter(securityService);
            break;
        case "degiro":
            console.log("[i] Processing file using DeGiro converter");
            console.log("[i] There is a new version of the DEGIRO converter available in public beta and we're looking for feedback!");
            console.log("[i] You can enable the new converter by setting the environment variable DEGIRO_FORCE_V3=true");
            converter = new DeGiroConverterV2(securityService);
            break;
        case "degiro-v3":
            console.log("[i] Processing file using DeGiro converter V3");
            console.log("[i] NOTICE: This converter is currently in public beta and may not be complete!");
            console.log("[i] Should you have issues with the result of the converter, please report a bug at https://git.new/degiro-v3-bug");
            converter = new DeGiroConverterV3(securityService);
            break;
        case "delta":
            console.log("[i] Processing file using Delta converter");
            converter = new DeltaConverter(securityService);
            break;
        case "directa":
            console.log("[i] Processing file using Directa converter, this is an experimental converter!");
            converter = new DirectaConverter(securityService);
            break;
        case "disnat":
            console.log("[i] Processing file using Disnat converter");
            converter = new DisnatConverter(securityService);
            break;
        case "etoro":
            console.log("[i] Processing file using Etoro converter");
            converter = new EtoroConverter(securityService);
            break;
        case "fp":
        case "finpension":
            console.log("[i] Processing file using Finpension converter");
            converter = new FinpensionConverter(securityService);
            break;
        case "ft":
        case "freetrade":
            console.log("[i] Processing file using Freetrade converter");
            converter = new FreetradeConverter(securityService);
            break;
        case "ibkr":
            console.log("[i] Processing file using IBKR converter");
            converter = new IbkrConverter(securityService);
            break;
        case "ie":
        case "investengine":
            console.log("[i] Processing file using InvestEngine converter");
            converter = new InvestEngineConverter(securityService);
            break;
        case "investimental":
            console.log("[i] Processing file using Investimental converter");
            converter = new InvestimentalConverter(securityService);
            break;
        case "parqet":
            console.log("[i] Processing file using Parqet converter");
            converter = new ParqetConverter(securityService);
            break;
        case "rabobank":
            console.log("[i] Processing file using Rabobank converter");
            converter = new RabobankConverter(securityService);
            break;
        case "relai":
            console.log("[i] Processing file using Relai converter");
            converter = new RelaiConverter(securityService);
            break;
        case "revolut":
            console.log("[i] Processing file using Revolut converter");
            converter = new RevolutConverter(securityService);
            break;
        case "saxo":
            console.log("[i] Processing file using Saxo converter");
            converter = new SaxoConverter(securityService);
            break;
        case "schwab":
            console.log("[i] Processing file using Schwab converter");
            converter = new SchwabConverter(securityService);
            break;
        case "sq":
        case "swissquote":
            console.log("[i] Processing file using Swissquote converter");
            converter = new SwissquoteConverter(securityService);
            break;
        case "tr":
        case "traderepublic":
            console.log("[i] Processing file using TradeRepublic converter");
            console.log("[i] NOTE: This converted is currently experimental");
            converter = new TradeRepublicConverter(securityService);
            break;
        case "t212":
        case "trading212":
            console.log("[i] Processing file using Trading212 converter");
            converter = new Trading212Converter(securityService);
            break;
        case "xtb":
            console.log("[i] Processing file using XTB converter");
            converter = new XtbConverter(securityService);
            break;
        default:
            throw new Error(`Unknown converter '${converterType}' provided`);
    }

    return converter;
}

/**
 * Core conversion function that converts CSV content to Ghostfolio import JSON.
 * This function is used by both CLI and API.
 *
 * @param converterType The type of converter to use (e.g., "trading212", "degiro")
 * @param csvContent The CSV file contents as a string
 * @param options Optional conversion options
 * @returns Promise resolving to ConversionResult with Ghostfolio export(s)
 */
export async function convertToGhostfolio(
    converterType: string,
    csvContent: string,
    options?: ConversionOptions
): Promise<ConversionResult> {

    // Validate account ID
    const accountId = options?.accountId || process.env.GHOSTFOLIO_ACCOUNT_ID;
    if (!accountId) {
        throw new Error("Account ID not provided! Set GHOSTFOLIO_ACCOUNT_ID environment variable or pass accountId in options.");
    }

    // Temporarily set the account ID in process.env for converters that read it directly
    const originalAccountId = process.env.GHOSTFOLIO_ACCOUNT_ID;
    process.env.GHOSTFOLIO_ACCOUNT_ID = accountId;

    // Handle tag IDs - can be string (comma-separated) or array
    const originalTagIds = process.env.GHOSTFOLIO_TAG_IDS;
    if (options?.tagIds) {
        const tagIdsValue = Array.isArray(options.tagIds)
            ? options.tagIds.join(",")
            : options.tagIds;
        process.env.GHOSTFOLIO_TAG_IDS = tagIdsValue;
    }

    console.log(`[i] Starting Export to Ghostfolio v${packageInfo.version}`);

    // Handle DEGIRO V3 flag
    let actualConverterType = converterType.toLocaleLowerCase();
    if (actualConverterType === "degiro" && `${process.env.DEGIRO_FORCE_V3}` === "true") {
        console.log("[i] Using DEGIRO V3 Beta converter because DEGIRO_FORCE_V3 was set to true..");
        actualConverterType = "degiro-v3";
    }

    try {
        // Create the converter
        const converter = await createConverter(actualConverterType);

        // Process the CSV content
        const result = await new Promise<GhostfolioExport>((resolve, reject) => {
            converter.processFileContents(
                csvContent,
                (result: GhostfolioExport) => resolve(result),
                (error: Error) => reject(error)
            );
        });

        // Apply options
        result.updateCashBalance = options?.updateCashBalance ??
            `${process.env.GHOSTFOLIO_UPDATE_CASH}`.toLocaleLowerCase() === "true";

        // Check if output should be split
        const splitOutput = options?.splitOutput ??
            `${process.env.GHOSTFOLIO_SPLIT_OUTPUT}`.toLocaleLowerCase() === "true";

        const exports: GhostfolioExport[] = [];
        const totalActivities = result.activities.length;

        if (!splitOutput || totalActivities <= 25) {
            // Single export
            exports.push(result);
        } else {
            // Split into chunks of 25
            const chunks = Math.ceil(totalActivities / 25);
            for (let i = 0; i < chunks; i++) {
                const chunkExport: GhostfolioExport = {
                    ...result,
                    activities: result.activities.slice(i * 25, (i + 1) * 25)
                };
                exports.push(chunkExport);
            }
        }

        console.log(`[i] Processing complete, produced ${exports.length} export(s) with ${totalActivities} total activities`);

        return {
            exports,
            totalActivities
        };

    } finally {
        // Restore original account ID
        if (originalAccountId !== undefined) {
            process.env.GHOSTFOLIO_ACCOUNT_ID = originalAccountId;
        }
        // Restore original tag IDs
        if (options?.tagIds) {
            if (originalTagIds !== undefined) {
                process.env.GHOSTFOLIO_TAG_IDS = originalTagIds;
            } else {
                delete process.env.GHOSTFOLIO_TAG_IDS;
            }
        }
    }
}

/**
 * Generate a filename for the Ghostfolio export
 *
 * @param converterType The converter type used
 * @param index Optional index for split files (0-based)
 * @param total Optional total number of files
 * @returns The generated filename
 */
export function generateExportFilename(converterType: string, index?: number, total?: number): string {
    const suffix = (total && total > 1) ? `-${index + 1}` : "";
    return `ghostfolio-${converterType.toLocaleLowerCase()}${suffix}-${dayjs().format("YYYYMMDDHHmmss")}.json`;
}

