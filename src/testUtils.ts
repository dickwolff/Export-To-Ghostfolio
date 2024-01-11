/* istanbul ignore */

import * as fs from "fs";
import { GhostfolioExport } from "./models/ghostfolioExport";

export function getResultFile(fileName: string): GhostfolioExport {

    const contents = fs.readFileSync(fileName, "utf-8");
    
    return JSON.parse(contents);
}
