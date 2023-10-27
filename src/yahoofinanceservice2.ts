import yahooFinance from "yahoo-finance2";

export class YahooFinanceService2 {


    constructor() {

        // Override logging, not interested in yahooFinance2 debug logging..
        yahooFinance.setGlobalConfig({});
    }

    public async getSecurity(symbol, expectedCurrency): Promise<any> {

        const searchResult = await yahooFinance.search(symbol);

        const items = [];

        const quotes = searchResult.quotes
            .filter((quote) => {
                // Filter out undefined symbols
                return quote.symbol;
            })
        const marketData = await yahooFinance.quote(
            quotes.map(({ symbol }) => {
                return symbol;
            })
        );

        for (const marketDataItem of marketData) {
            const quote = quotes.find((currentQuote) => {
                return currentQuote.symbol === marketDataItem.symbol;
            });


            items.push({
                symbol,
                currency: marketDataItem.currency,
                name: {
                    longName: quote.longname,
                    quoteType: quote.quoteType,
                    shortName: quote.shortname,
                    symbol: quote.symbol
                }
            });
        }

        const match = items.find(m => m.currency === expectedCurrency);
console.log(symbol, match)
        return match;
    }
}