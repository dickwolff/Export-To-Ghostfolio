export class DeGiroRecord {
    date: string;
    time: string;
    currencyDate: Date;
    product: string;
    isin: string;
    description: string;
    fx: string;
    currency: string;
    amount: string;
    balance_currency: string; // not used, but improtant for hashing
    balance: string; //// not used, but improtant for hashing
    orderId: string;
}
