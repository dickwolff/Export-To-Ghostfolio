import YahooFinance from "yahoo-finance2";
import { YahooFinanceTestdata } from "./testing/yahooFinanceTestdataWriter";

/**
 * Interface what wraps yahoo-finance2.
 */
interface IYahooFinance {
    search(query: string, queryOptionsOverrides?: any, moduleOptions?: any): Promise<any>;
    quoteSummary(symbol: string, queryOptionsOverrides?: any, moduleOptions?: any): Promise<any>;
}

/**
 * Wrapper class around calls yahoo-finance2.
 * 
 * Also has the possibility to add testdata to the mock.
 */
class YahooFinanceService implements IYahooFinance {

    private readonly yahooFinance: InstanceType<typeof YahooFinance>;

    constructor(config?: any, private yahooFinanceTestdataWriter?: YahooFinanceTestdata) {
        // v3 API: configuration is passed to the constructor
        this.yahooFinance = new YahooFinance(config);
    }

    /** @inheritdoc */
    public async search(query: string, queryOptionsOverrides?: any, moduleOptions?: any): Promise<any> {

        const result = await this.yahooFinance.search(query, queryOptionsOverrides, moduleOptions);

        // If the testdata writer is provided, save result to test data file.
        this.yahooFinanceTestdataWriter?.addSearchResult(query, result);

        return result;
    }

    /** @inheritdoc */
    public async quoteSummary(symbol: string, queryOptionsOverrides?: any, moduleOptions?: any): Promise<any> {

        const result = await this.yahooFinance.quoteSummary(symbol, queryOptionsOverrides, moduleOptions);

        // If the testdata writer is provided, save result to test data file.
        this.yahooFinanceTestdataWriter?.addQuoteSummaryResult(symbol, result);

        return result;
    }
}

export {
    IYahooFinance as YahooFinance,
    YahooFinanceService
}
