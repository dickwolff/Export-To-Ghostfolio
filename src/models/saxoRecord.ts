export class SaxoRecord {
    clientId: string;
    tradeDate: Date;
    valueDate: Date;
    type: string;
    instrument: string;
    instrumentIsin: string;
    instrumentCurrency: string;
    exchangeDescription: string;
    instrumentSymbol: string;
    event: string;
    bookedAmount: number;
    orderId: string;
    conversionRate: number;
    fromDerivative: string;
    underlyingAssetType: string;
}