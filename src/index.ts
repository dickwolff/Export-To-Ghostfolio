import * as fs from "fs";
import { GhostfolioExport } from "./models/ghostfolioExport";
import { DeGiroConverter } from "./converters/degiroConverter";
import { DeGiroConverterV2 } from "./converters/degiroConverterV2";
import { AbstractConverter } from "./converters/abstractconverter";
import { Trading212Converter } from "./converters/trading212Converter";
import { SchwabConverter } from "./converters/schwabConverter";
import { SwissquoteConverter } from "./converters/swissquoteConverter";
import { FinpensionConverter } from "./converters/finpensionConverter";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

let converter: AbstractConverter;

// Determine convertor type.
switch (process.argv[2].toLocaleLowerCase()) {
    case "t212":
    case "trading212":
        console.log("[i] Processing file using Trading212 converter");
        converter = new Trading212Converter();
        break;
    case "degiro":
        console.log("[i] Processing file using DeGiro converter");
        console.log("[i] NOTE: There is a new version available of the DeGiro converter.");
        console.log("[i] This is currently in beta and we're looking for feedback!");
        console.log("[i] You can run the beta converter with the command 'npm run start degiro-v2'.");
        converter = new DeGiroConverter();
        break;
    case "degiro-v2":
        console.log("[i] Processing file using DeGiro converter (V2 Beta)");
        console.log("[i] NOTE: You are running a converter that is currently in beta.");
        console.log("[i] If you have any issues, please report them on GitHub. Many thanks!");
        converter = new DeGiroConverterV2();
        break;
    case "fp":
    case "finpension":
        console.log("[i] Processing file using Finpension converter");
        converter = new FinpensionConverter();
        break;
    case "sq":
    case "swissquote":
        console.log("[i] Processing file using Swissquote converter");
        converter = new SwissquoteConverter();
        break;
    case "schwab":
        console.log("[i] Processing file using Schwab converter");
        converter = new SchwabConverter();
        break;
    default:    
        throw new Error(`Unknown converter '${process.argv[2].toLocaleLowerCase()}' provided`);
}

// Map the file to a Ghostfolio import.
converter.processFile(inputFile, (result: GhostfolioExport) => {

    console.log("[i] Processing complete, writing to file..")

    // Write result to file.
    const fileContents = JSON.stringify(result);
    fs.writeFileSync(`ghostfolio-${process.argv[2].toLocaleLowerCase()}.json`, fileContents, { encoding: "utf-8" });

    console.log(`[i] Wrote data to 'ghostfolio-${process.argv[2].toLocaleLowerCase()}.json'!`);
});
