import { constants } from "buffer";

export class GhostfolioService {

    private cachedBearerToken: string;

    // Local cache of earlier retrieved tickers.
    private tickerCache = {};

    /**
     * Get tickers for a security.
     * 
     * @param isin The isin of the security
     * @param ticker The ticker of the security
     * @param progress The progress bar instance, for logging (optional)
     * @returns The tickers that are retrieved from Ghostfolio.
     */
    public async getTicker(isin?, ticker?, name?, expectedCurrency?, progress?): Promise<any> {

        // If the ticker is not known, retrieve the data for the first time.
        if (!this.tickerCache[isin]) {

            // First try by ISIN.
            let tickers = await this.getTickersByQuery(isin);

            // If no result found by ISIN, try by ticker.
            if (tickers.length == 0 && ticker) {
                this.logDebug(`getTicker(): Not a single ticker found for ISIN ${isin}, trying by ticker ${ticker}`, progress);
                tickers = await this.getTickersByQuery(ticker);
            }
            else {
                this.logDebug(`getTicker(): Found ${tickers.length} matches by ISIN`, progress);
            }
            
            // Find a symbol that has the same currency.
            let tickerMatch = tickers.find(i => i.currency === expectedCurrency);

            // If no currency match has been found, try to query Ghostfolio by ticker exclusively and search again.
            if (!tickerMatch && ticker) {
                this.logDebug(`getTicker(): No initial match found, trying by ticker ${ticker}`, progress);
                const queryByTicker = await this.getTickersByQuery(ticker);
                tickerMatch = queryByTicker.find(i => i.currency === expectedCurrency);
            }
            else {
                this.logDebug(`getTicker(): Match found for ticker ${ticker}`, progress);
            }

            // If still no currency match has been found, try to query Ghostfolio by name exclusively and search again.
            if (!tickerMatch && name) {
                this.logDebug(`getTicker(): No match found for ticker ${ticker}, trying by name ${name}`, progress);
                const queryByTicker = await this.getTickersByQuery(name);
                tickerMatch = queryByTicker.find(i => i.currency === expectedCurrency);
            }
            else {
                this.logDebug(`getTicker(): Match found for name ${name}`, progress);
            }
            
            if (tickerMatch) {
                this.tickerCache[isin] = tickerMatch;
            }
        }

        return this.tickerCache[isin];
    }

    /**
     * Get tickers for a security by a given key.
     * 
     * @param query The security identification to query by.
     * @returns The tickers that are retrieved from Ghostfolio, if any.
     */
    public async getTickersByQuery(query: string, retryCount: number = 0): Promise<any> {

        // Stop after retrycount 3, if it doesn't work now it probably never will...
        if (retryCount === 3) {
            throw new Error("Failed to retrieve tickers because of authentication error..")
        }

        // Retrieve YAHOO Finance ticker that corresponds to the ISIN from Trading 212 record.
        const tickerUrl = `${process.env.GHOSTFOLIO_API_URL}/api/v1/symbol/lookup?query=${query}`;
        const tickerResponse = await fetch(tickerUrl, {
            method: "GET",
            headers: [["Authorization", `Bearer ${this.cachedBearerToken}`]]
        });

        // Check if response was unauthorized. If so, refresh token and try again.
        if (tickerResponse.status === 401) {
            console.error("Ghostfolio access token is not valid!");

            await this.getBearer(true);
            return await this.getTickersByQuery(query, retryCount++);
        }

        var response = await tickerResponse.json();

        return response.items;
    }

    private async getBearer(refresh: boolean = false): Promise<void> {

        // Only get bearer when it isn't set or has to be refreshed.
        if (!this.cachedBearerToken || refresh) {

            // Retrieve bearer token for authentication.
            const bearerResponse = await fetch(`${process.env.GHOSTFOLIO_API_URL}/api/v1/auth/anonymous/${process.env.GHOSTFOLIO_SECRET}`);
            const bearer = await bearerResponse.json();
            this.cachedBearerToken = bearer.authToken;
            return;
        }
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
}