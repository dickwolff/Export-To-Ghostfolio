import { GhostfolioActivity } from "./ghostfolioActivity";

class GhostfolioExport {
    meta: GhostfolioMeta;
    accounts?: GhostfolioAccount[];
    assetProfiles?: GhostfolioAssetProfile[];
    activities: GhostfolioActivity[];
    updateCashBalance?: boolean;
}

class GhostfolioMeta {
    date: Date;
    version: string;
}

class GhostfolioAccount {
    balances: { date: string, value: number }[];
    comment: string | null;
    currency: string;
    id: string;
    name: string;
    platformId: string | null;
}

// Describes a MANUAL symbol, so Ghostfolio can import activities (like fees) that have no market data.
class GhostfolioAssetProfile {
    assetClass: string | null;
    assetSubClass: string | null;
    comment: string | null;
    countries: any[];
    currency: string;
    cusip: string | null;
    dataSource: string;
    figi: string | null;
    figiComposite: string | null;
    figiShareClass: string | null;
    holdings: any[];
    isActive: boolean;
    isin: string | null;
    marketData: any[];
    name: string;
    sectors: any[];
    symbol: string;
    url: string | null;
}

export {
    GhostfolioAccount,
    GhostfolioAssetProfile,
    GhostfolioExport,
    GhostfolioMeta
}
