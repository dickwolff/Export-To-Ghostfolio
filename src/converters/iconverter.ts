import { GhostfolioExport } from "../../models/ghostfolioExport";

export interface IConverter {

    processFile(inputFile: string): GhostfolioExport;
}