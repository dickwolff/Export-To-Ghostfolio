export class DeltaRecord {
    date: Date;
    way: string;
    baseAmount: number;
    baseCurrencyName: string;
    baseType: string;
    quoteAmount: number;
    quoteCurrency: string;
    exchange: string;
    sentReceivedFrom: string;
    sentTo: string;
    feeAmount: number;
    feeCurrencyName: string;
    broker: string;
    notes: string;
}
