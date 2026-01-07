/* istanbul ignore file */

import * as fs from "fs";
import { YahooFinance } from "../yahooFinanceService";
import { mapReviver } from "../helpers/dictionaryHelpers";
import { YF_QUOTESUMMARYRESULTS_FILENAME, YF_SEARCHRESULTS_FILENAME } from "./yahooFinanceTestdataWriter";

export default class YahooFinanceServiceMock implements YahooFinance {

    // Local cache of earlier retrieved symbols.
    private yahooFinanceSearchResults: Map<string, any> = new Map<string, any>();
    private yahooFinanceQuoteSummaryResults: Map<string, any> = new Map<string, any>();

    constructor() {

        const searchResultContents = fs.readFileSync(YF_SEARCHRESULTS_FILENAME, { encoding: "utf-8" });
        const searchResultContentsData = JSON.parse(searchResultContents, mapReviver);
        this.yahooFinanceSearchResults = searchResultContentsData;

        const quoteSummaryContents = fs.readFileSync(YF_QUOTESUMMARYRESULTS_FILENAME, { encoding: "utf-8" });
        const quoteSummaryContentsData = JSON.parse(quoteSummaryContents, mapReviver);
        this.yahooFinanceQuoteSummaryResults = quoteSummaryContentsData;
    }

    /** @inheritdoc */
    public async search(query: string, _?: any, __?: any): Promise<any> {

        if (this.yahooFinanceSearchResults.has(query)) {
            return this.yahooFinanceSearchResults.get(query);
        }

        return { quotes: [] };
    }

    /** @inheritdoc */
    public async quoteSummary(symbol: string, _?: any, __?: any): Promise<any> {

        if (this.yahooFinanceQuoteSummaryResults.has(symbol)) {
            return this.yahooFinanceQuoteSummaryResults.get(symbol);
        }

        return null;
    }
}