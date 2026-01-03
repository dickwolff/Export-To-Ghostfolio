import path from "path";
import * as fs from "fs";
import dayjs from "dayjs";
import { SecurityService } from "./securityService";
import GhostfolioService from "./ghostfolioService";
import { GhostfolioExport } from "./models/ghostfolioExport";
import { createConverter as createConverterCore } from "./coreConverter";

import packageInfo from "../package.json";

async function createAndRunConverter(converterType: string, inputFilePath: string, outputFilePath: string, completionCallback: CallableFunction, errorCallback: CallableFunction, securityService?: SecurityService) {

    // Verify if Ghostolio account ID is set (because without it there can be no valid output).
    if (!process.env.GHOSTFOLIO_ACCOUNT_ID) {
        return errorCallback(new Error("Environment variable GHOSTFOLIO_ACCOUNT_ID not set!"));
    }

    console.log(`[i] Starting Export to Ghostfolio v${packageInfo.version}`);

    // If DEBUG_LOGGING is enabled, set spaces to 2 else null for easier to read JSON output.
    const spaces = `${process.env.DEBUG_LOGGING}`.toLocaleLowerCase() === "true" ? 2 : null;

    const converterTypeLc = converterType.toLocaleLowerCase();

    // Determine convertor type.
    const converter = await createConverter(converterTypeLc, securityService);

    // Map the file to a Ghostfolio import.
    converter.readAndProcessFile(inputFilePath, async (result: GhostfolioExport) => {

        // Set cash balance update setting according to settings.
        result.updateCashBalance = `${process.env.GHOSTFOLIO_UPDATE_CASH}`.toLocaleLowerCase() === "true"

        // Check if the output needs to be split into chunks. If so, calculate how many files need to be produced.
        const splitOutput = `${process.env.GHOSTFOLIO_SPLIT_OUTPUT}`.toLocaleLowerCase() === "true";
        const filesToProduce = !splitOutput ? 1 : Math.ceil(result.activities.length / 25);

        console.log(`[i] Processing complete, writing to ${filesToProduce === 1 ? "file" : filesToProduce + " files"}..`);

        // Create a base result by copying everything but the activities.
        const baseResult: GhostfolioExport = {
            ...result,
            activities: []
        };

        for (let fix = 0; fix < filesToProduce; fix++) {

            // If only one file is to be produced, copy all activities.
            // Otherwise, slice the activities into chunks of 25.
            baseResult.activities = filesToProduce === 1
                ? result.activities
                : result.activities.slice(fix * 25, (fix + 1) * 25);

            // Write result to file.
            const outputFileName = path.join(outputFilePath, `ghostfolio-${converterTypeLc}${filesToProduce === 1 ? "" : "-" + (fix + 1)}-${dayjs().format("YYYYMMDDHHmmss")}.json`);
            const fileContents = JSON.stringify(baseResult, null, spaces);
            fs.writeFileSync(outputFileName, fileContents, { encoding: "utf-8" });

            console.log(`[i] Wrote data to '${outputFileName}'${filesToProduce === 1 ? "" : " (" + (fix + 1) + " of " + filesToProduce + ")"}`);

            await tryAutomaticValidationAndImport(outputFileName);
        }

        completionCallback();

    }, (error) => errorCallback(error));
}

/**
 * Create a converter instance for the given converter type.
 */
async function createConverter(converterType: string, securityService?: SecurityService) {
    return createConverterCore(converterType, securityService);
}

async function tryAutomaticValidationAndImport(outputFileName: string) {

    try {
        let ghostfolioService;

        // When automatic validation is enabled, do this.
        if (`${process.env.GHOSTFOLIO_VALIDATE}` === "true") {

            ghostfolioService = new GhostfolioService();

            console.log('[i] Automatic validation is allowed. Start validating..');
            const validationResult = await ghostfolioService.validate(outputFileName);
            console.log(`[i] Finished validation. ${validationResult ? 'Export was valid!' : 'Export was not valid!'}`);
        }
        else {
            console.log('[i] You can now automatically validate the generated file against Ghostfolio. Set GHOSTFOLIO_VALIDATE=true in your environment variables to enable this feature.');
        }

        // When automatic import is enabled, do this.
        if (`${process.env.GHOSTFOLIO_IMPORT}` === "true") {

            ghostfolioService = ghostfolioService ?? new GhostfolioService();

            console.log('[i] Automatic import is allowed. Start importing..');
            console.log('[i] THIS IS AN EXPERIMENTAL FEATURE!! Use this at your own risk!');
            const importResult = await ghostfolioService.import(outputFileName);
            console.log(`[i] Finished importing. ${importResult > 0 ? `Succesfully imported ${importResult} activities!` : 'Import failed!'}`);
        }
        else {
            console.log('[i] You can now automatically import the generated file into Ghostfolio. Set GHOSTFOLIO_IMPORT=true in your environment variables to enable this feature');
            console.log('[i] THIS IS AN EXPERIMENTAL FEATURE!! Use this at your own risk!');
        }
    }
    catch (e) {
        console.log(`[e] Did not complete automatic import & validation due to errors: ${e}`);
    }
}

export {
    createAndRunConverter,
    createConverter
}
