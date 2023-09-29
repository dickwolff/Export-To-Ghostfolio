import { GhostfolioOrderType } from "./ghostfolioOrderType";

export class GhostfolioActivity {
    accountId: string;
    comment: string;
    fee: number;
    quantity: number;
    type: GhostfolioOrderType;
    unitPrice: number;
    currency: string;
    dataSource: string;
    date: string;
    symbol: string
}
