import yahooFinance from 'yahoo-finance2';
import { YahooFinanceRecord } from '../models/yahooFinanceRecord';

export class YahooFinanceService {

    // Local cache of earlier retrieved tickers.
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
     * Get tickers for a security.
     * 
     * @param isin The isin of the security
     * @param symbol The symbol of the security
     * @param progress The progress bar instance, for logging (optional)
     * @returns The ticker that is retrieved from cache or Yahoo Finance.
     */
    public async getTicker(isin?, symbol?, name?, expectedCurrency?, progress?): Promise<YahooFinanceRecord> {

        // When isin was given, check wether there is a ticker conversion cached. Then change map. 
        if (isin && this.isinSymbolCache.has(isin)) {
            symbol = this.isinSymbolCache[isin];
        }

        // Second, check if the requested security is known by ticker (if given).
        if (symbol) {
            const tickerMatch = this.symbolCache.has(symbol);

            // If a match was found, return the security.
            if (tickerMatch) {
                return tickerMatch[1];
            }
        }
        // The security is not known. Try to find is.

        // First try by ISIN.
        let tickers = await this.getTickersByQuery(isin);
        this.logDebug(`getTicker(): Found ${tickers.length} matches by ISIN`, progress);

        // If no result found by ISIN, try by symbol.
        if (tickers.length == 0 && symbol) {
            this.logDebug(`getTicker(): Not a single symbol found for ISIN ${isin}, trying by symbol ${symbol}`, progress);
            tickers = await this.getTickersByQuery(symbol);
        }

        // Find a symbol that has the same currency.
        let tickerMatch = tickers.find(i => i.currency === expectedCurrency);

        // If no currency match has been found, try to query Yahoo Finance by ticker exclusively and search again.
        if (!tickerMatch && symbol) {
            this.logDebug(`getTicker(): No initial match found, trying by symbol ${symbol}`, progress);
            const queryByTicker = await this.getTickersByQuery(symbol);
            tickerMatch = queryByTicker.find(i => i.currency === expectedCurrency);
        }

        // If still no currency match has been found, try to query Yahoo Finance by name exclusively and search again.
        if (!tickerMatch && name) {
            this.logDebug(`getTicker(): No match found for symbol ${symbol}, trying by name ${name}`, progress);
            const queryByTicker = await this.getTickersByQuery(name);
            tickerMatch = queryByTicker.find(i => i.currency === expectedCurrency);
        }

        // If a match was found, store it in cache..
        if (tickerMatch) {

            this.logDebug(`getTicker(): Match found for ${isin | symbol}`, progress);

            // If there was an isin given, place it in the isin-symbol mapping cache.
            if (isin) {
                this.isinSymbolCache[isin] = tickerMatch.symbol;
            }

            // Store the record in cache by symbol.
            this.symbolCache[tickerMatch.symbol] = tickerMatch;

            return this.symbolCache[tickerMatch.symbol];
        }

        this.logDebug(`No result found for ${isin | symbol | name}..`);

        return null;
    }

    /**
     * Get tickers for a security by a given key.
     * 
     * @param query The security identification to query by.
     * @returns The tickers that are retrieved from Yahoo Finance, if any.
     */
    public async getTickersByQuery(query: string): Promise<YahooFinanceRecord[]> {

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