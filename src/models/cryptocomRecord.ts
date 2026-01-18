export class CryptoComRecord {
    timestampUTC: Date;
    transactionDescription: string;
    currency: string;
    amount: number;
    toCurrency: string;
    toAmount: number;
    nativeCurrency: string;
    nativeAmount: number;
    nativeAmountInUSD: number;
    transactionKind: string;
}