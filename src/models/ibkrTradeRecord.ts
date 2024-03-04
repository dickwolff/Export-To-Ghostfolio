import { IbkrRecord } from "./ibkrRecord";

export class IbkrTradeRecord extends IbkrRecord {
    quantity: number;
    price: number;
    totalAmount: number;
    tradeCurrency: string;
    commission: number;
    commissionCurrency: string;
}
