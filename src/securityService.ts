import * as cacache from "cacache";
import { existsSync, readFileSync } from "fs";
import YahooFinanceRecord from "./models/yahooFinanceRecord";
import { YahooFinance, YahooFinanceService } from "./yahooFinanceService";
import { mapReplacer, mapReviver } from "./helpers/dictionaryHelpers";

/* istanbul ignore next */
const cachePath = process.env.E2G_CACHE_FOLDER || "/var/tmp/e2g-cache";

/* istanbul ignore next */
const symbolOverrideFile = process.env.ISIN_OVERRIDE_FILE || "isin-overrides.txt";

export class SecurityService {

    // Local cache of earlier retrieved symbols.
    private isinSymbolCache: Map<string, string> = new Map<string, string>();
    private symbolCache: Map<string, YahooFinanceRecord> = new Map<string, YahooFinanceRecord>();

    // Local cache of symbol overrides.
    private isinOverrideCache: Map<string, string> = new Map<string, string>();

    private preferedExchangePostfix: string = null;

    /**
     * Default constructor.
     * 
     * @param yahooFinance Service that sends requests to Yahoo Finance. Creates default instance of YahooFinanceService
     */
    constructor(private yahooFinance: YahooFinance = new YahooFinanceService({
        // v3 API: configuration is passed to the constructor
        logger: {
            info: (..._args: any[]) => { },
            warn: (..._args: any[]) => { },
            error: (..._args: any[]) => { },
            debug: (..._args: any[]) => { },
        },
        queue: {
            timeout: 60000
        }
    })) {

        // Also override console.error, since for some reason yahooFinance2 does not allows to disable this inside their library.
        /* istanbul ignore next */
        console.error = () => { };

        // Retrieve prefered exchange postfix if set in .env
        this.preferedExchangePostfix = process.env.DEGIRO_PREFERED_EXCHANGE_POSTFIX;
    }

    /**
     * Get a security.
     *
     * @param isin The isin of the security
     * @param symbol The symbol of the security
     * @param name The name of the security
     * @param expectedCurrency The currency of the transaction that should match the security
     * @param progress The progress bar instance, for logging (optional)
     * @returns The security that is retrieved from cache or Yahoo Finance.
     */
    public async getSecurity(isin?, symbol?, name?, expectedCurrency?, progress?): Promise<YahooFinanceRecord> {

        let isinOverridden = false;

        // When isin was given, check wether there is a ISIN-symbol conversion cached.
        if (isin) {

            // First, check if the symbol was manually overridden.
            if (this.isinOverrideCache.has(isin)) {

                symbol = this.isinOverrideCache.get(isin);
                this.logDebug(`Converted ISIN ${isin} to symbol ${symbol} as it was overridden!`, progress);
                isinOverridden = true;
            }
            // If not, check if the ISIN is known in the cache.
            else if (this.isinSymbolCache.has(isin)) {
                symbol = this.isinSymbolCache.get(isin);
            }
        }

        // Second, check if the requested security is known by symbol (if given).
        // If a match was found, return the security.
        if (symbol && this.symbolCache.has(symbol)) {
            this.logDebug(`Retrieved symbol ${symbol} from cache!`, progress);
            return this.symbolCache.get(symbol);
        }

        // The security is not known. Try to find it
        let symbols: YahooFinanceRecord[] = [];

        // First try by ISIN (if it was not overridden).
        // If no ISIN was given as a parameter, just skip this part.
        if (!isinOverridden && isin) {
            symbols = await this.getSymbolsByQuery(isin, progress);
            this.logDebug(`getSecurity(): Found ${symbols.length} match${symbols.length === 1 ? "" : "es"} by ISIN ${isin}`, progress);

            // If no result found by ISIN, try by symbol.
            if (symbols.length == 0 && symbol) {
                this.logDebug(`getSecurity(): Not a single symbol found for ISIN ${isin}, trying by symbol ${symbol}`, progress);
                symbols = await this.getSymbolsByQuery(symbol, progress);
            }
        }
        else {

            // If no ISIN was given, try by symbol directly.
            symbols = await this.getSymbolsByQuery(symbol, progress);
            this.logDebug(`getSecurity(): Found ${symbols.length} matches by symbol ${symbol}`, progress);
        }

        // Find a symbol that has the same currency.
        let symbolMatch = this.findSymbolMatchByCurrency(symbols, expectedCurrency);

        // If not found and the expectedCurrency is GBP, try again with GBp.
        if (!symbolMatch && expectedCurrency === "GBP") {
            symbolMatch = this.findSymbolMatchByCurrency(symbols, "GBp");
        }

        // If no match found and no symbol given, take the symbol from the first ISIN match.
        // Split on '.', so BNS.TO becomes BNS (for more matches).
        if (!symbol && symbols.length > 0) {
            symbol = symbols[0].symbol.split(".")[0];
        }

        // If no currency match has been found, try to query Yahoo Finance by symbol exclusively and search again.
        if (!symbolMatch && symbol) {
            this.logDebug(`getSecurity(): No initial match found, trying by symbol ${symbol}`, progress);
            const queryBySymbol = await this.getSymbolsByQuery(symbol, progress);
            symbolMatch = this.findSymbolMatchByCurrency(queryBySymbol, expectedCurrency);
        }

        // If still no match has been found and the symbol contains a dot ('.'), take the part before the dot and search again.
        if (!symbolMatch && symbol && symbol.indexOf(".") > -1) {
            const symbolSplit = symbol.split(".");
            this.logDebug(`getSecurity(): No match found for ${symbol}, trying by symbol ${symbolSplit[0]}`, progress);

            if (this.symbolCache.has(symbolSplit[0])) {
                symbolMatch = this.symbolCache.get(symbolSplit[0]);
            }
            else {
                const queryBySymbol = await this.getSymbolsByQuery(symbolSplit[0], progress);
                symbolMatch = this.findSymbolMatchByCurrency(queryBySymbol, expectedCurrency);
            }
        }

        // If no name was given, take name from the first ISIN match.
        if (!name && symbols.length > 0) {
            name = symbols[0].name;
        }

        // If still no currency match has been found, try to query Yahoo Finance by name exclusively and search again.
        if (!symbolMatch && name) {
            this.logDebug(`getSecurity(): No match found for symbol ${symbol || "not provided"}, trying by name ${name}`, progress);
            const queryByName = await this.getSymbolsByQuery(name, progress);
            symbolMatch = this.findSymbolMatchByCurrency(queryByName, expectedCurrency);
        }

        // If a match was found, store it in cache..
        if (symbolMatch) {

            this.logDebug(`getSecurity(): Match found for ${isin ?? symbol ?? name}`, progress);

            // If there was an isin given, place it in the isin-symbol mapping cache (if it wasn't there before).
            if (isin && !this.isinSymbolCache.has(isin)) {
                await this.saveInCache(isin, null, symbolMatch.symbol);
            }

            // Store the record in cache by symbol (if it wasn't there before).
            if (!this.symbolCache.has(symbolMatch.symbol)) {
                await this.saveInCache(null, symbolMatch.symbol, symbolMatch);
            }

            return symbolMatch;
        }

        return null;
    }

    /**
     * Get the overridden symbol for a given key (ISIN or symbol).
     *
     * @param key The ISIN or symbol to look up
     * @returns The overridden symbol if found, otherwise null
     */
    public getSymbolOverride(key: string): string | null {
        if (this.isinOverrideCache.has(key)) {
            return this.isinOverrideCache.get(key);
        }
        return null;
    }

    /**
     * Load the cache with ISIN and symbols.
     *
     * @returns The size of the loaded cache
     */
    public async loadCache(): Promise<[number, number, number]> {

        // Verify if there is data in the ISIN-Symbol cache. If so, restore to the local variable.
        const isinSymbolCacheExist = await cacache.get.info(cachePath, "isinSymbolCache");
        if (isinSymbolCacheExist) {
            const cache = await cacache.get(cachePath, "isinSymbolCache");
            const cacheAsJson = JSON.parse(cache.data.toString(), mapReviver);
            this.isinSymbolCache = cacheAsJson;
        }

        // Verify if there is data in the Symbol cache. If so, restore to the local variable.
        const symbolCacheExists = await cacache.get.info(cachePath, "symbolCache");
        if (symbolCacheExists) {
            const cache = await cacache.get(cachePath, "symbolCache");
            const cacheAsJson = JSON.parse(cache.data.toString(), mapReviver);
            this.symbolCache = cacheAsJson;
        }

        // If a symbol override file exists, load it into cache.
        if (await existsSync(symbolOverrideFile)) {
            console.log("[i] Found symbol override file. Loading..");
            const overrides = readFileSync(symbolOverrideFile, "utf8").split("\n");
            for (let idx = 0; idx < overrides.length; idx++) {
                const line = overrides[idx].split("=");
                
                // Sanitize input, skip what does not comply.
                if (line.length !== 2 || line[0] === "" || line[1] === "") {
                    continue;
                }

                this.isinOverrideCache.set(line[0], line[1]);
            }
        }

        // Return cache sizes.
        return [this.isinSymbolCache.size, this.symbolCache.size, this.isinOverrideCache.size];
    }

    /**
     * Get symbols for a security by a given key.
     *
     * @param query The security identification to query by.
     * @returns The symbols that are retrieved from Yahoo Finance, if any.
     */
    private async getSymbolsByQuery(query: string, progress?: any): Promise<YahooFinanceRecord[]> {

        // If query is empty, don't bother searching.
        if (!query) {
            this.logDebug("getSymbolsByQuery(): Query was empty, so no search was done with Yahoo Finance", true);
            return [];
        }

        // First get quotes for the query.
        let queryResult = await this.yahooFinance.search(query,
            {
                newsCount: 0,
                quotesCount: 10
            },
            {
                validateResult: false
            });

        // Check if no match was found and a name was given (length > 12 so no ISIN).
        // In that case, try and find a partial match by removing a part of the name.
        if (queryResult.quotes.length === 0 && query.length > 12) {
            this.logDebug(`getSymbolsByQuery(): No match found when searching by name for ${query}. Trying a partial name match with first 20 characters..`, progress, true);
            queryResult = await this.yahooFinance.search(query.substring(0, 20),
                {
                    newsCount: 0,
                    quotesCount: 10
                },
                {
                    validateResult: false
                });
        }

        const result: YahooFinanceRecord[] = [];

        // Loop through the resulted quotes and retrieve summary data.
        for (let idx = 0; idx < queryResult.quotes.length; idx++) {
            const quote = queryResult.quotes[idx];

            // Check wether the quote has a symbol. If not, just skip it..
            if (!quote.symbol) {
                this.logDebug(`getSymbolsByQuery(): Quote '${query}' has no symbol at Yahoo Finance ${quote.symbol}. Skipping..`, progress, true);
                continue;
            }

            // Get quote summary details (containing currency, price, etc).
            // Put in try-catch, since Yahoo Finance can return faulty data and crash..
            let quoteSummaryResult;
            try {
                quoteSummaryResult = await this.yahooFinance.quoteSummary(quote.symbol, {}, { validateResult: false });
            }
            catch (err) {
                this.logDebug(`getSymbolsByQuery(): An error occurred retrieving summary for ${quote.symbol}. ${err}. Skipping..`, progress, true);
                continue;
            }

            // Check if a result was returned that has the required fields.
            if (!quoteSummaryResult.price) {
                this.logDebug(`getSymbolsByQuery(): Got no useful result from Yahoo Finance for symbol ${quote.symbol}. Skipping..`, progress, true);
                continue;
            }

            let currency, exchange, price, symbol;
            currency = quoteSummaryResult.price.currency;
            exchange = quoteSummaryResult.price.exchange;
            symbol = quoteSummaryResult.price.symbol;
            price = quoteSummaryResult.price.regularMarketPrice;

            result.push({
                currency: currency,
                exchange: exchange,
                price: price,
                symbol: symbol,
                name: quote.longname
            });
        }

        return result;
    }

    /**
     * Find a match by either currency and/or prefered exchange in a list of given symbols.
     *
     * @param symbols The list of symbols to query
     * @param expectedCurrency The expected currency for the symbol
     * @returns A symbol matched by either currency and/or prefered exchange, if any found..
     */
    private findSymbolMatchByCurrency(symbols: YahooFinanceRecord[], expectedCurrency?: any) {

        let symbolMatch: YahooFinanceRecord;

        // When no currency is expected and there are multiple symbols, pick the first.
        if (!expectedCurrency && symbols.length > 0) {
            return symbols[0];
        }

        // If a prefered exchange was given, try find a match by both currency and prefered exchange.
        if (this.preferedExchangePostfix != '') {
            symbolMatch = symbols.find(i => i.currency === expectedCurrency && i.symbol.indexOf(this.preferedExchangePostfix) > -1);
        }

        // If no match by prefered exchange found, then try by currency only.
        if (!symbolMatch) {
            symbolMatch = symbols.find(i => i.currency === expectedCurrency);
        }

        return symbolMatch;
    }

    private async saveInCache(isin?: string, symbol?: string, value?: any) {

        // Save ISIN-value combination to cache if given.
        if (isin && value) {
            this.isinSymbolCache.set(isin, value);
            await cacache.put(cachePath, "isinSymbolCache", JSON.stringify(this.isinSymbolCache, mapReplacer));
        }

        // Save symbol-value combination to cache if given.
        if (symbol && value) {
            this.symbolCache.set(symbol, value);
            await cacache.put(cachePath, "symbolCache", JSON.stringify(this.symbolCache, mapReplacer));
        }
    }

    /* istanbul ignore next */
    private logDebug(message, progress?, additionalTabs?: boolean) {

        const messageToLog = (additionalTabs ? '\t' : '') + `\t${message}`

        if (process.env.DEBUG_LOGGING === "true") {
            if (!progress) {
                console.log(`[d] ${messageToLog}`);
            }
            else {
                progress.log(`[d] ${messageToLog}\n`);
            }
        }
    }
}
