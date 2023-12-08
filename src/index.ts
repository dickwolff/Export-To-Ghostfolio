import * as fs from "fs";
import { GhostfolioExport } from "./models/ghostfolioExport";
import { DeGiroConverter } from "./converters/degiroConverter";
import { AbstractConverter } from "./converters/abstractconverter";
import { Trading212Converter } from "./converters/trading212Converter";
import { SchwabConverter } from "./converters/schwabConverter";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

let converter: AbstractConverter;

// Determine convertor type.
switch (process.argv[2].toLocaleLowerCase()) {
    case "trading212":
        console.log("[i] Processing file using Trading212 converter");
        converter = new Trading212Converter();
        break;
    case "degiro":
        console.log("[i] Processing file using DeGiro converter");
        converter = new DeGiroConverter();
        break;
    case "schwab":
        console.log("[i] Processing file using Schwab converter");
        converter = new SchwabConverter();
        break;
    default:
        throw new Error("No converter provided (i.e. trading212, degiro)");
}

// Map the file to a Ghostfolio import.
converter.processFile(inputFile, (result: GhostfolioExport) => {

    console.log("[i] Processing complete, writing to file..")

    // Write result to file.
    const fileContents = JSON.stringify(result);
    fs.writeFileSync(`ghostfolio-${process.argv[2].toLocaleLowerCase()}.json`, fileContents, { encoding: "utf-8" });
    
    console.log(`[i] Wrote data to 'ghostfolio-${process.argv[2].toLocaleLowerCase()}.json'!`);
});
