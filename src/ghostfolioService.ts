
export class GhostfolioService {

    private bearer: any = null;

    public async getTicker(symbol: string, expectedCurrency: string, isRetry: boolean = false): Promise<any> {

        await new Promise(resolve => setTimeout(resolve, 1000));

        return await this.getTickerDelayed(symbol, expectedCurrency, isRetry);
    }

    private async getTickerDelayed(symbol: string, expectedCurrency: string, isRetry: boolean): Promise<any> {

        console.log("getticker");
        // Retrieve bearer token for authentication.
        if (!this.bearer) {
            console.log("initial bearer");
            const bearerResponse = await fetch(`${process.env.GHOSTFOLIO_API_URL}/api/v1/auth/anonymous/${process.env.GHOSTFOLIO_SECRET}`);
            this.bearer = await bearerResponse.json();
        }
        // Retrieve YAHOO Finance ticker that corresponds to the ISIN from DEGIRO record.
        const tickerUrl = `${process.env.GHOSTFOLIO_API_URL}/api/v1/symbol/lookup?query=${symbol}`;
        console.log("ticker request send", tickerUrl);
        const tickerResponse = await this.fetchWithTimeout(tickerUrl, {
            method: "GET",
            headers: [["Authorization", `Bearer ${this.bearer.authToken}`]]
        });
        console.log("ticker response got");

        // Check if response was not unauthorized.
        if (tickerResponse.status === 401) {
            console.error("Ghostfolio access token is not valid!");

            // Invalidate bearer and retry if not already in retry.
            if (!isRetry) {
                this.bearer = null;
                return this.getTickerDelayed(symbol, expectedCurrency, true);
            }
            else {
                throw new Error("Ghostfolio access token stil not valid after retry!");
            }
        }

        console.log("ticker data parse");
        const tickersData = await tickerResponse.json();

        const match = (tickersData.items as any[]).find(i => i.currency === expectedCurrency);
        console.log(match);
        console.log("ticker match found");
        return match;
    }

    private async fetchWithTimeout(resource, options = {}) {
        const timeout = 8000;

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);

        return response;
    }
}