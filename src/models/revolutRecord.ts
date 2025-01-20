export class RevolutRecord {
    date: Date
    ticker: string;
    type: string;
    quantity: number;
    pricePerShare: number;
    totalAmount: number;
    currency: string;
    fxRate: string;

    // Revolut Crypto properties.
    symbol: string;
    price: number;
    value: number;
    fees: number;
}
