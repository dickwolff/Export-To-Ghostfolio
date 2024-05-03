import * as cacache from "cacache";
import yahooFinance from "yahoo-finance2";
import YahooFinanceRecord from "./models/yahooFinanceRecord";
import YahooFinanceTestWriter from "./testing/yahooFinanceTestWriter";

const cachePath = process.env.E2G_CACHE_FOLDER || "/var/tmp/e2g-cache";

export class YahooFinanceService {

    // Local cache of earlier retrieved symbols.
    private isinSymbolCache: Map<string, string> = new Map<string, string>();
    private symbolCache: Map<string, YahooFinanceRecord> = new Map<string, YahooFinanceRecord>();

    private preferedExchangePostfix: string = null;

    constructor(private yahooFinanceTestWriter?: YahooFinanceTestWriter) {

        // Override logging, not interested in yahooFinance2 debug logging..
        yahooFinance.setGlobalConfig({
            logger: {
                info: (...args: any[]) => this.sink(),
                warn: (...args: any[]) => this.sink(),
                error: (...args: any[]) => this.sink(),
                debug: (...args: any[]) => this.sink(),
            },
            queue: {
                timeout: 60000
            }
        });

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

        // When isin was given, check wether there is a symbol conversion cached. Then change map.
        if (isin && this.isinSymbolCache.has(isin)) {
            symbol = this.isinSymbolCache.get(isin);
        }

        // Second, check if the requested security is known by symbol (if given).
        // If a match was found, return the security.
        if (symbol && this.symbolCache.has(symbol)) {
            this.logDebug(`Retrieved symbol ${symbol} from cache!`, progress);
            return this.symbolCache.get(symbol);
        }

        // The security is not known. Try to find it
        let symbols: YahooFinanceRecord[] = [];

        // First try by ISIN.
        // If no ISIN was given as a parameter, just skip this part.
        if (isin) {
            symbols = await this.getSymbolsByQuery(isin, progress);
            this.logDebug(`getSecurity(): Found ${symbols.length} match${symbols.length === 1 ? "" : "es"} by ISIN ${isin}`, progress);

            // If no result found by ISIN, try by symbol.
            if (symbols.length == 0 && symbol) {
                this.logDebug(`getSecurity(): Not a single symbol found for ISIN ${isin}, trying by symbol ${symbol}`, progress);
                symbols = await this.getSymbolsByQuery(symbol, progress);
            }
        } else {

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
     * Load the cache with ISIN and symbols.
     *
     * @returns The size of the loaded cache
     */
    public async loadCache(): Promise<[number, number]> {

        // Verify if there is data in the ISIN-Symbol cache. If so, restore to the local variable.
        const isinSymbolCacheExist = await cacache.get.info(cachePath, "isinSymbolCache");
        if (isinSymbolCacheExist) {
            const cache = await cacache.get(cachePath, "isinSymbolCache");
            const cacheAsJson = JSON.parse(cache.data.toString(), this.mapReviver);
            this.isinSymbolCache = cacheAsJson;
        }

        // Verify if there is data in the Symbol cache. If so, restore to the local variable.
        const symbolCacheExists = await cacache.get.info(cachePath, "symbolCache");
        if (symbolCacheExists) {
            const cache = await cacache.get(cachePath, "symbolCache");
            const cacheAsJson = JSON.parse(cache.data.toString(), this.mapReviver);
            this.symbolCache = cacheAsJson;
        }

        // Return cache sizes.
        return [this.isinSymbolCache.size, this.symbolCache.size];
    }

    /**
     * Get symbols for a security by a given key.
     *
     * @param query The security identification to query by.
     * @returns The symbols that are retrieved from Yahoo Finance, if any.
     */
    private async getSymbolsByQuery(query: string, progress?: any): Promise<YahooFinanceRecord[]> {

        // First get quotes for the query.
        let queryResult = await yahooFinance.search(query,
            {
                newsCount: 0,
                quotesCount: 10
            },
            {
                validateResult: false
            });
        this.yahooFinanceTestWriter?.addSearchResult(query, queryResult);

        // Check if no match was found and a name was given (length > 10 so no ISIN).
        // In that case, try and find a partial match by removing a part of the name.
        if (queryResult.quotes.length === 0 && query.length > 10) {
            this.logDebug(`getSymbolsByQuery(): No match found when searching by name for ${query}. Trying a partial name match with first 20 characters..`, progress, true);
            queryResult = await yahooFinance.search(query.substring(0, 20),
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
                quoteSummaryResult = await yahooFinance.quoteSummary(quote.symbol, {}, { validateResult: false });
            }
            catch (err) {
                this.logDebug(`getSymbolsByQuery(): An error ocurred while retrieving summary for ${quote.symbol}. Skipping..`, progress, true);
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
            await cacache.put(cachePath, "isinSymbolCache", JSON.stringify(this.isinSymbolCache, this.mapReplacer));
        }

        // Save symbol-value combination to cache if given.
        if (symbol && value) {
            this.symbolCache.set(symbol, value);
            await cacache.put(cachePath, "symbolCache", JSON.stringify(this.symbolCache, this.mapReplacer));
        }
    }

    /* istanbul ignore next */
    private logDebug(message, progress?, additionalTabs?: boolean) {

        const messageToLog = (additionalTabs ? '\t' : '') + `\t${message}`

        if (Boolean(process.env.DEBUG_LOGGING) == true) {
            if (!progress) {
                console.log(`[d] ${messageToLog}`);
            }
            else {
                progress.log(`[d] ${messageToLog}\n`);
            }
        }
    }

    private sink() { }

    private mapReplacer(_, value) {
        if (value instanceof Map) {
            return {
                dataType: 'Map',
                value: Array.from(value.entries()), // or with spread: value: [...value]
            };
        } else {
            return value;
        }
    }

    /* istanbul ignore next */
    private mapReviver(_, value) {
        if (typeof value === 'object' && value !== null) {
            if (value.dataType === 'Map') {
                return new Map(value.value);
            }
        }

        return value;
    }
}
