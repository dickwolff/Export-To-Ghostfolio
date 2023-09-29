import * as fs from "fs";
import { IConverter } from "./converters/iconverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { Trading212Converter } from "./converters/trading212Converter";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

let converter: IConverter;

// Determine convertor type.
switch (process.argv[2].toLocaleLowerCase()) {
    case "trading212":
        console.log("Processing file using Trading212 converter");
        converter = new Trading212Converter();
        break;

    default:
        throw new Error("No converter provided (i.e. trading212, degiro)");
}

// Map the file to a Ghostfolio import.
converter.processFile(inputFile, (result: GhostfolioExport) => {

    // Write result to file.
    const fileContents = JSON.stringify(result);
    fs.writeFileSync(`ghostfolio-${process.argv[2].toLocaleLowerCase()}.json`, fileContents, { encoding: "utf-8" });
});

