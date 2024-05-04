/* istanbul ignore file */

import * as fs from "fs";
import { mapReplacer, mapReviver } from "../helpers/dictionaryHelpers";

const YF_SEARCHRESULTS_FILENAME = "./src/testing/data/yahooFinanceSearchResults.json";
const YF_QUOTESUMMARYRESULTS_FILENAME = "./src/testing/data/yahooFinanceQuoteSummaryResults.json";

class YahooFinanceTestdataWriter {

    // Local cache of earlier retrieved symbols.
    private yahooFinanceSearchResults: Map<string, any> = new Map<string, any>();
    private yahooFinanceQuoteSummaryResults: Map<string, any> = new Map<string, any>();

    constructor() {

        // Create search results data file if not exists.
        if (!fs.existsSync(YF_SEARCHRESULTS_FILENAME)) {
            fs.writeFileSync(YF_SEARCHRESULTS_FILENAME, `{"dataType":"Map","value":[]}`);
        }

        // Create quote summary results data file if not exist.
        if (!fs.existsSync(YF_QUOTESUMMARYRESULTS_FILENAME)) {
            fs.writeFileSync(YF_QUOTESUMMARYRESULTS_FILENAME, `{"dataType":"Map","value":[]}`);
        }

        const searchResultContents = fs.readFileSync(YF_SEARCHRESULTS_FILENAME, { encoding: "utf-8" });
        const searchResultContentsData = JSON.parse(searchResultContents, mapReviver);
        this.yahooFinanceSearchResults = searchResultContentsData;

        const quoteSummaryContents = fs.readFileSync(YF_QUOTESUMMARYRESULTS_FILENAME, { encoding: "utf-8" });
        const quoteSummaryContentsData = JSON.parse(quoteSummaryContents, mapReviver);
        this.yahooFinanceQuoteSummaryResults = quoteSummaryContentsData;
    }

    /**
     * Add a Yahoo Finance search result (if it does not already exist).
     * 
     * @param query The key for this result
     * @param searchResult The search result to add
     */
    public addSearchResult(query: string, searchResult: any) {

        if (!this.yahooFinanceSearchResults.has(query)) {
            this.yahooFinanceSearchResults.set(query, searchResult);
        }

        fs.writeFileSync(YF_SEARCHRESULTS_FILENAME, JSON.stringify(this.yahooFinanceSearchResults, mapReplacer));
    }

    /**
     * Add a Yahoo Finance quote summary result (if it does not already exist).
     * 
     * @param query The key for this result
     * @param quoteSummaryResult The quote summary result to add
     */
    public addQuoteSummaryResult(query: string, quoteSummaryResult: any) {

        if (!this.yahooFinanceQuoteSummaryResults.has(query)) {
            this.yahooFinanceQuoteSummaryResults.set(query, quoteSummaryResult);
        }

        fs.writeFileSync(YF_QUOTESUMMARYRESULTS_FILENAME, JSON.stringify(this.yahooFinanceQuoteSummaryResults, mapReplacer));
    }
}

export {
    YF_SEARCHRESULTS_FILENAME,
    YF_QUOTESUMMARYRESULTS_FILENAME,
    YahooFinanceTestdataWriter
}
