export class RelaiRecord {
    date: Date;
    transactionType: string;
    btcAmount: number;
    btcPrice: number;
    currencyPair: string;
    fiatAmountExclFees: number;
    fiatCurrency: string;
    fee: number;
    feeCurrency: string;
    destination: string;
    operationId: string;
    counterparty: string;
}
