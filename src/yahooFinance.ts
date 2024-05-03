import yahooFinance from "yahoo-finance2";
import { SearchOptions } from "yahoo-finance2/dist/esm/src/modules/search";
import { YahooFinanceOptions } from "yahoo-finance2/dist/esm/src/lib/options";
import { QuoteSummaryOptions } from "yahoo-finance2/dist/esm/src/modules/quoteSummary";
import { ModuleOptionsWithValidateFalse } from "yahoo-finance2/dist/esm/src/lib/moduleCommon";

/**
 * Interface what wraps yahoo-finance2.
 */
interface YahooFinance {
    setGlobalConfig(_config: YahooFinanceOptions);
    search(query: string, queryOptionsOverrides?: SearchOptions, moduleOptions?: ModuleOptionsWithValidateFalse);
    quoteSummary(symbol: string, queryOptionsOverrides?: QuoteSummaryOptions, moduleOptions?: ModuleOptionsWithValidateFalse);
}

/**
 * Wrapper class around yahoo-finance2 for mocking purposes.
 */
class YahooFinanceWrapper implements YahooFinance {

    public async setGlobalConfig(_config: YahooFinanceOptions) {
        await yahooFinance.setGlobalConfig(_config);
    }

    public async search(query: string, queryOptionsOverrides?: SearchOptions, moduleOptions?: ModuleOptionsWithValidateFalse) {
        await yahooFinance.search(query, queryOptionsOverrides, moduleOptions)
    }

    public async quoteSummary(symbol: string, queryOptionsOverrides?: QuoteSummaryOptions, moduleOptions?: ModuleOptionsWithValidateFalse) {
        await yahooFinance.quoteSummary(symbol, queryOptionsOverrides, moduleOptions)
    }
}

export {
    YahooFinance,
    YahooFinanceWrapper
}
