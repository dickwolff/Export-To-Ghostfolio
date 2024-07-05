import { SecurityService } from "../securityService";
import { Trading212Record } from "../models/trading212Record";
import { Trading212Converter } from "../converters/trading212Converter";

export default class Trading212ScheduledService {

    private _cachedInstruments: Trading212Instrument[] = [];

    public async run() {

        console.log("[i] Start Scheduled Trading212 Service");

        // Cache instruments for this run.
        await this.cacheInstruments();

        // Get all the transactions.
        const transactions = await this.getTransactions();

        if (transactions.length === 0) {
            console.log("[i] Finished! No transactions for today..")
            return;
        }

        // Create the converter.
        const converter = new Trading212Converter(new SecurityService());

        // Run the converter.
        await converter.processRecords(
            transactions,
            () => {
                console.log("[i] Scheduled Trading212 Service ran succesfully!");
            }, (e) => {
                console.log("[e] Scheduled Trading212 Service has an error!");
                console.error(e);
            });
    }

    private async cacheInstruments() {

        const instrumentsResponse = await fetch("https://live.trading212.com/api/v0/equity/metadata/instruments", {
            method: "GET",
            headers: [["Authorization", `${process.env.TRADING212_API_KEY}`]]
        });

        this._cachedInstruments = await instrumentsResponse.json() as Trading212Instrument[];
    }

    private async getTransactions(): Promise<Trading212Record[]> {

        const result: Trading212Record[] = [];

        const orders = await this.getOrders();
        for (let idx = 0; idx < orders.length; idx++) {
            const order = orders[idx];

            const symbolMatch = this._cachedInstruments.find(c => c.ticker === order.ticker);
            const noOfShares = order.orderedQuantity ? Math.abs(order.orderedQuantity) : parseFloat((order.fillPrice / order.filledValue).toFixed(4));
            const orderType = "Market " + (order.orderedQuantity < 0 ? "sell" : "buy");

            result.push({
                action: orderType,
                time: order.dateModified,
                isin: symbolMatch.isin,
                ticker: symbolMatch.shortName,
                name: symbolMatch.name,
                noOfShares: noOfShares,
                priceShare: order.fillPrice,
                currencyPriceShare: symbolMatch.currencyCode,
                exchangeRate: null,
                result: null,
                currenyResult: null,
                total: order.filledValue,
                currencyTotal: "EUR",
                withholdingTax: null,
                currencyWithholdingTax: null,
                notes: `Transaction ID (Fill ID): ${order.id}`,
                chargeAmountEur: null,
                id: null,
            });
        }

        const dividends = await this.getDividends();
        for (let idx = 0; idx < dividends.length; idx++) {
            const dividend = dividends[idx];

            const symbolMatch = this._cachedInstruments.find(c => c.ticker === dividend.ticker);

            result.push({
                action: "Dividend (Dividend)",
                time: dividend.paidOn,
                isin: symbolMatch.isin,
                ticker: symbolMatch.shortName,
                name: symbolMatch.name,
                noOfShares: dividend.quantity,
                priceShare: dividend.grossAmountPerShare,
                currencyPriceShare: symbolMatch.currencyCode,
                exchangeRate: null,
                result: null,
                currenyResult: null,
                total: dividend.amount,
                currencyTotal: "EUR",
                withholdingTax: 0,
                currencyWithholdingTax: null,
                notes: null,
                chargeAmountEur: null,
                id: dividend.reference
            });
        }

        return result;
    }

    private async getOrders(): Promise<Trading212Order[]> {

        const ordersResponse = await fetch("https://live.trading212.com/api/v0/equity/history/orders?limit=49", {
            method: "GET",
            headers: [["Authorization", `${process.env.TRADING212_API_KEY}`], ["Content-Type", "application/json"]]
        });

        let orders = (await ordersResponse.json()).items as Trading212Order[];

        // Only get filled orders for today.
        orders = orders.filter(o => o.status === "FILLED" && new Date(o.dateModified).toDateString() === new Date().toDateString());

        return orders;
    }

    private async getDividends(): Promise<Trading212PaidDividend[]> {

        const ordersResponse = await fetch("https://live.trading212.com/api/v0/history/dividends?limit=49", {
            method: "GET",
            headers: [["Authorization", `${process.env.TRADING212_API_KEY}`], ["Content-Type", "application/json"]]
        });

        let dividends = (await ordersResponse.json()).items as Trading212PaidDividend[];

        // Only get paid dividends for today.
        dividends = dividends.filter(o => new Date(o.paidOn).toDateString() === new Date().toDateString());

        return dividends;
    }
}

interface Trading212Instrument {
    ticker: string;
    isin: string;
    currencyCode: string;
    name: string;
    shortName: string;
}

interface Trading212Order {
    id: string;
    ticker: string;
    orderedQuantity: number;
    filledQuantity: number;
    orderedValue: number;
    filledValue: number;
    fillPrice: number;
    dateModified: Date;
    dateCreated: Date;
    status: string;
    action: string;
}

interface Trading212PaidDividend {
    ticker: string;
    reference: string;
    quantity: number;
    grossAmountPerShare: number;
    amount: number;
    paidOn: Date;
}
