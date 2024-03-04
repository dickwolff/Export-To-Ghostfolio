import { IbkrRecord } from "./ibkrRecord";

export class IbkrDividendRecord extends IbkrRecord {
    description: string;
    amount: number;
    currency: string;
}
