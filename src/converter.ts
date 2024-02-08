import path from "path";
import * as fs from "fs";
import { GhostfolioExport } from "./models/ghostfolioExport";
import { EtoroConverter } from "./converters/etoroConverter";
import { DeGiroConverter } from "./converters/degiroConverter";
import { SchwabConverter } from "./converters/schwabConverter";
import { DeGiroConverterV2 } from "./converters/degiroConverterV2";
import { AbstractConverter } from "./converters/abstractconverter";
import { Trading212Converter } from "./converters/trading212Converter";
import { SwissquoteConverter } from "./converters/swissquoteConverter";
import { FinpensionConverter } from "./converters/finpensionConverter";


export function createAndRunConverter(converterType: string, inputFilePath: string, outputFilePath: string, completionCallback: CallableFunction, errorCallback: CallableFunction) {

    // Verify if Ghostolio account ID is set (because without it there can be no valid output).
    if (!process.env.GHOSTFOLIO_ACCOUNT_ID) {
        return errorCallback(new Error("Environment variable GHOSTFOLIO_ACCOUNT_ID not set!"));
    }

    const converterTypeLc = converterType.toLocaleLowerCase();

    // Determine convertor type.
    const converter = createConverter(converterTypeLc);

    // Map the file to a Ghostfolio import.
    converter.readAndProcessFile(inputFilePath, (result: GhostfolioExport) => {

        console.log("[i] Processing complete, writing to file..")

        // Write result to file.
        const outputFileName = path.join(outputFilePath, `ghostfolio-${converterTypeLc}.json`);
        const fileContents = JSON.stringify(result);
        fs.writeFileSync(outputFileName, fileContents, { encoding: "utf-8" });

        console.log(`[i] Wrote data to '${outputFileName}.json'!`);

        completionCallback();

    }, (error) => errorCallback(error));
}

function createConverter(converterType: string): AbstractConverter {

    let converter: AbstractConverter;

    switch (converterType) {
        case "t212":
        case "trading212":
            console.log("[i] Processing file using Trading212 converter");
            converter = new Trading212Converter();
            break;
        case "degiro":
            console.log("[i] Processing file using DeGiro converter");
            console.log("[i] NOTE: There is a new version available of the DeGiro converter");
            console.log("[i] The new converter has multiple record parsing improvements and also supports platform fees.");
            console.log("[i] The new converter is currently in beta and we're looking for your feedback!");
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
        case "etoro":
            console.log("[i] Processing file using Etoro converter");
            converter = new EtoroConverter();
            break;
        default:
            throw new Error(`Unknown converter '${converterType}' provided`);
    }

    return converter;
}
