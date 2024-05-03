/* istanbul ignore file */

import * as fs from "fs";

export default class YahooFinanceTestWriter {

    private YF_SEARCHRESULTS_FILENAME = "yahooFinanceSearchResults.json";
    private YF_QUOTESUMMARYRESULTS_FILENAME = "yahooFinanceQuoteSummaryResults.json";


    // Local cache of earlier retrieved symbols.
    private yahooFinanceSearchResults: Map<string, any> = new Map<string, any>();
    private yahooFinanceQuoteSummaryResults: Map<string, any> = new Map<string, any>();

    /**
     * Load the test writer.
     * 
     * This reads the existing test data files.
     */
    public async load() {
        console.log("AAAAAAA", JSON.stringify(this.yahooFinanceSearchResults));
        // Create search results data file if not exists.
        if (!await fs.existsSync(this.YF_SEARCHRESULTS_FILENAME)) {
            await fs.writeFileSync(this.YF_SEARCHRESULTS_FILENAME, "{}");
        }

        // Create quote summary results data file if not exist.
        if (!await fs.existsSync(this.YF_QUOTESUMMARYRESULTS_FILENAME)) {
            await fs.writeFileSync(this.YF_QUOTESUMMARYRESULTS_FILENAME, "{}");
        }

        const searchResultContents = await fs.readFileSync(this.YF_SEARCHRESULTS_FILENAME, { encoding: "utf-8" });
        const searchResultContentsData = JSON.parse(searchResultContents, this.mapReviver);
        this.yahooFinanceSearchResults = searchResultContentsData;

        const quoteSummaryContents = await fs.readFileSync(this.YF_QUOTESUMMARYRESULTS_FILENAME, { encoding: "utf-8" });
        const quoteSummaryContentsData = JSON.parse(quoteSummaryContents, this.mapReviver);
        this.yahooFinanceQuoteSummaryResults = quoteSummaryContentsData;

        console.log(this.yahooFinanceSearchResults)
        console.log(this.yahooFinanceQuoteSummaryResults)
    }

    /**
     * Add a Yahoo Finance search result (if it does not already exist).
     * 
     * @param query The key for this result
     * @param searchResult The search result to add
     */
    public async addSearchResult(query: string, searchResult: any) {

        if (!this.yahooFinanceSearchResults.has(query)) {
            this.yahooFinanceSearchResults.set(query, searchResult);
        }

        console.log(this.yahooFinanceSearchResults)
        await fs.writeFileSync(this.YF_SEARCHRESULTS_FILENAME, JSON.stringify(this.yahooFinanceSearchResults));
    }

    /**
     * Add a Yahoo Finance quote summary result (if it does not already exist).
     * 
     * @param query The key for this result
     * @param quoteSummaryResult The quote summary result to add
     */
    public async addQuoteSummaryResult(query: string, quoteSummaryResult: any) {

        if (!this.yahooFinanceQuoteSummaryResults.has(query)) {
            this.yahooFinanceQuoteSummaryResults.set(query, quoteSummaryResult);
        }
        console.log(this.yahooFinanceQuoteSummaryResults)

        await fs.writeFileSync(this.YF_QUOTESUMMARYRESULTS_FILENAME, JSON.stringify(this.yahooFinanceQuoteSummaryResults));
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