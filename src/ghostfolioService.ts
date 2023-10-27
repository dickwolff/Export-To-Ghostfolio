
export class GhostfolioService {

    private bearer: any = null;

    public async getTicker(symbol: string, expectedCurrency: string, isRetry: boolean = false): Promise<any> {

        // Retrieve bearer token for authentication.
        if (!this.bearer) {
            const bearerResponse = await fetch(`${process.env.GHOSTFOLIO_API_URL}/api/v1/auth/anonymous/${process.env.GHOSTFOLIO_SECRET}`);
            this.bearer = await bearerResponse.json();
        }

        // Retrieve YAHOO Finance ticker that corresponds to the ISIN from DEGIRO record.
        const tickerUrl = `${process.env.GHOSTFOLIO_API_URL}/api/v1/symbol/lookup?query=${symbol}`;
        const tickerResponse = await fetch(tickerUrl, {
            method: "GET",
            headers: [["Authorization", `Bearer ${this.bearer.authToken}`]]
        });

        // Check if response was not unauthorized.
        if (tickerResponse.status === 401) {
            console.error("Ghostfolio access token is not valid!");

            // Invalidate bearer and retry if not already in retry.
            if (!isRetry) {
                this.bearer = null;
                return this.getTicker(symbol, expectedCurrency, true);
            }
            else {
                throw new Error("Ghostfolio access token stil not valid after retry!");
            }
        }


        const tickersData = await tickerResponse.json();

        const match = (tickersData.items as any[]).find(i => i.currency === expectedCurrency);
        console.log(match);

        return match;
    }
}