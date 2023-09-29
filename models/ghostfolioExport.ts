import { GhostfolioActivity } from "./ghostfolioActivity";

export class GhostfolioExport {
    meta: GhostfolioMeta;
    activities: GhostfolioActivity[];
}

export class GhostfolioMeta {
    date: Date;
    version: string;
}
