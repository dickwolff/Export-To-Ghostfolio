import yahooFinance from "yahoo-finance2";
import { SearchOptions } from "yahoo-finance2/dist/esm/src/modules/search";
import { YahooFinanceOptions } from "yahoo-finance2/dist/esm/src/lib/options";
import { QuoteSummaryOptions } from "yahoo-finance2/dist/esm/src/modules/quoteSummary";
import { ModuleOptionsWithValidateFalse } from "yahoo-finance2/dist/esm/src/lib/moduleCommon";
import { YahooFinanceTestdataWriter } from "./testing/yahooFinanceTestdataWriter";

/**
 * Interface what wraps yahoo-finance2.
 */
interface YahooFinance {
    setGlobalConfig(_config: YahooFinanceOptions);
    search(query: string, queryOptionsOverrides?: SearchOptions, moduleOptions?: ModuleOptionsWithValidateFalse): Promise<any>;
    quoteSummary(symbol: string, queryOptionsOverrides?: QuoteSummaryOptions, moduleOptions?: ModuleOptionsWithValidateFalse): Promise<any>;
}

/**
 * Wrapper class around calls yahoo-finance2.
 * 
 * Also has the possibility to add testdata to the mock.
 */
class YahooFinanceService implements YahooFinance {

    constructor(private yahooFinanceTestdataWriter?: YahooFinanceTestdataWriter) { }

    /** @inheritdoc */
    public setGlobalConfig(_config: YahooFinanceOptions) {
        yahooFinance.setGlobalConfig(_config);
    }

    /** @inheritdoc */
    public async search(query: string, queryOptionsOverrides?: SearchOptions, moduleOptions?: ModuleOptionsWithValidateFalse): Promise<any> {
       
        const result = await yahooFinance.search(query, queryOptionsOverrides, moduleOptions);

        // If the testdata writer is provided, save result to test data file.
        this.yahooFinanceTestdataWriter?.addSearchResult(query, result);

        return result;
    }

    /** @inheritdoc */
    public async quoteSummary(symbol: string, queryOptionsOverrides?: QuoteSummaryOptions, moduleOptions?: ModuleOptionsWithValidateFalse): Promise<any> {
        
        const result = await yahooFinance.quoteSummary(symbol, queryOptionsOverrides, moduleOptions);

        // If the testdata writer is provided, save result to test data file.
        this.yahooFinanceTestdataWriter?.addQuoteSummaryResult(symbol, result);

        return result;
    }
}

export {
    YahooFinance,
    YahooFinanceService
}
