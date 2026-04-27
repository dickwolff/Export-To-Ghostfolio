export class XtbV2Record {
    type: string;
    ticker: string;
    instrument: string;
    time: string;       // "YYYY-MM-DD HH:mm:ss" UTC
    amount: number;
    id: number;
    comment: string;
    product: string;    // e.g. "IKE", "My Trades"
}
