import { GhostfolioActivity } from "./ghostfolioActivity";

class GhostfolioExport {
    meta: GhostfolioMeta;
    activities: GhostfolioActivity[];
    updateCashBalance: boolean;
}

class GhostfolioMeta {
    date: Date;
    version: string;
}

export {
    GhostfolioExport,
    GhostfolioMeta
}
