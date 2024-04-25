import { GhostfolioActivity } from "./ghostfolioActivity";

class GhostfolioExport {
    meta: GhostfolioMeta;
    activities: GhostfolioActivity[];
}

class GhostfolioMeta {
    date: Date;
    version: string;
}

export {
    GhostfolioExport,
    GhostfolioMeta
}
