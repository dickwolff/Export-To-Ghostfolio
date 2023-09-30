import yahooFinance from 'yahoo-finance2';
import { YahooFinanceRecord } from '../models/yahooFinanceRecord';

export class YahooFinanceService {

    // Local cache of earlier retrieved symbols.
    private isinSymbolCache: Map<string, string> = new Map<string, string>();
    private symbolCache: Map<string, YahooFinanceRecord> = new Map<string, YahooFinanceRecord>();

    constructor() {
        
        // Override logging, not interested in yahooFinance2 debug logging..
        yahooFinance.setGlobalConfig({
            logger: {
                info: (...args: any[]) => console.log(...args),
                warn: (...args: any[]) => console.error(...args),
                error: (...args: any[]) => console.error(...args),
                debug: (...args: any[]) => this.sink(),
            }
        })
    }

    /**
     * Get a security.
     * 
     * @param isin The isin of the security
     * @param symbol The symbol of the security
     * @param progress The progress bar instance, for logging (optional)
     * @returns The security that is retrieved from cache or Yahoo Finance.
     */
    public async getSecurity(isin?, symbol?, name?, expectedCurrency?, progress?): Promise<YahooFinanceRecord> {

        // When isin was given, check wether there is a symbol conversion cached. Then change map. 
        if (isin && this.isinSymbolCache.has(isin)) {
            symbol = this.isinSymbolCache[isin];
        }

        // Second, check if the requested security is known by symbol (if given).
        if (symbol) {
                const symbolMatch = this.symbolCache.has(symbol);

            // If a match was found, return the security.
            if (symbolMatch) {
                return symbolMatch[1];
            }
        }
        // The security is not known. Try to find is.

        // First try by ISIN.
        let symbols = await this.getSymbolsByQuery(isin);
        this.logDebug(`getSecurity(): Found ${symbols.length} matches by ISIN`, progress);

        // If no result found by ISIN, try by symbol.
        if (symbols.length == 0 && symbol) {
            this.logDebug(`getSecurity(): Not a single symbol found for ISIN ${isin}, trying by symbol ${symbol}`, progress);
            symbols = await this.getSymbolsByQuery(symbol);
        }

        // Find a symbol that has the same currency.
        let symbolMatch = symbols.find(i => i.currency === expectedCurrency);

        // If no currency match has been found, try to query Yahoo Finance by symbol exclusively and search again.
        if (!symbolMatch && symbol) {
            this.logDebug(`getSecurity(): No initial match found, trying by symbol ${symbol}`, progress);
            const queryBySymbol = await this.getSymbolsByQuery(symbol);
            symbolMatch = queryBySymbol.find(i => i.currency === expectedCurrency);
        }

        // If still no currency match has been found, try to query Yahoo Finance by name exclusively and search again.
        if (!symbolMatch && name) {
            this.logDebug(`getSecurity(): No match found for symbol ${symbol}, trying by name ${name}`, progress);
            const queryBySymbol = await this.getSymbolsByQuery(name);
            symbolMatch = queryBySymbol.find(i => i.currency === expectedCurrency);
        }

        // If a match was found, store it in cache..
        if (symbolMatch) {

            this.logDebug(`getSymbol(): Match found for ${isin | symbol}`, progress);

            // If there was an isin given, place it in the isin-symbol mapping cache.
            if (isin) {
                this.isinSymbolCache[isin] = symbolMatch.symbol;
            }

            // Store the record in cache by symbol.
            this.symbolCache[symbolMatch.symbol] = symbolMatch;

            return symbolMatch;
        }

        this.logDebug(`getSymbol(): No result found for ${isin | symbol | name}..`);

        return null;
    }

    /**
     * Get symbols for a security by a given key.
     * 
     * @param query The security identification to query by.
     * @returns The symbols that are retrieved from Yahoo Finance, if any.
     */
    private async getSymbolsByQuery(query: string): Promise<YahooFinanceRecord[]> {

        // First get quotes for the query.
        const queryResult = await yahooFinance.search(query, {
            newsCount: 0,
            quotesCount: 6
        });

        const result: YahooFinanceRecord[] = [];

        // Loop through the resulted quotes and retrieve summary data.
        for (let idx = 0; idx < queryResult.quotes.length; idx++) {
            const quote = queryResult.quotes[idx];

            const quoteSummaryResult = await yahooFinance.quoteSummary(quote.symbol);

            result.push({
                currency: quoteSummaryResult.summaryDetail.currency,
                exchange: quoteSummaryResult.price.exchange,
                price: quoteSummaryResult.price.regularMarketPrice,
                symbol: quoteSummaryResult.price.symbol
            });
        }

        return result;
    }

    private logDebug(message, progress?) {

        if (process.env.DEBUG_LOGGING) {

            if (!progress) {
                console.log(`\t${message}`);
            }
            else {
                progress.log(`\t${message}\n`);
            }
        }
    }

    private sink() { }
}