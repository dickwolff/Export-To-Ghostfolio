import path from "path";
import * as fs from "fs";
import chokidar from "chokidar";
import * as cacache from "cacache";
import { createAndRunConverter } from "./converter";
import { FileTypeMatcher } from "./helpers/fileTypeMatcher";

// Check if the cache should be purged.
if (Boolean(process.env.PURGE_CACHE)) {

    console.log("[i] Purging cache (PURGE_CACHE set to true)..");
    Promise.all([
        cacache.rm("/var/tmp/e2g-cache", "isinSymbolCache"),
        cacache.rm("/var/tmp/e2g-cache", "symbolCache")
    ]).then(() => console.log("[i] Cache purged!"));
}

// Define input and output.
const inputFolder = process.env.E2G_INPUT_FOLDER || "/var/tmp/e2g-input";
const outputFolder = process.env.E2G_OUTPUT_FOLDER || "/var/tmp/e2g-output";
const usePolling = Boolean(process.env.USE_POLLING) || false;

console.log(`[i] Watching ${inputFolder}${usePolling ? " (using polling)" : ""}..`);

let isProcessing = false;

chokidar
    .watch(inputFolder, { usePolling: usePolling })
    .on("add", filePath => {

        isProcessing = true;

        console.log(`[i] Found ${path.basename(filePath)}!`);

        const fileContents = fs.readFileSync(filePath, "utf-8");

        const converter = FileTypeMatcher.detectFileType(fileContents);

        if (!converter) {
            console.log("[e] Could not determine file type from header");
            fs.rmSync(filePath);
            isProcessing = false;
            return;
        }

        console.log(`[i] Determined the file type to be of kind '${converter}'.`);

        // Determine convertor type and run conversion.
        createAndRunConverter(converter, filePath, outputFolder,
            () => {

                // After conversion was succesful, remove input file.
                console.log(`[i] Finished converting ${path.basename(filePath)}, removing file..`);
                fs.rmSync(filePath);

                isProcessing = false;

                if (!usePolling) {
                    console.log("[i] Stop container as usePolling is set to false..");
                    process.exit(0);
                }

            }, (err) => {

                console.log("[e] An error ocurred while processing.");
                console.log(`[e] ${err}`);

                // Move file with errors to output folder so it can be fixed manually.
                console.log("[e] Moving file to output..");
                const errorFilePath = path.join(outputFolder, path.basename(filePath));
                fs.copyFileSync(filePath, errorFilePath);
                fs.rmSync(filePath);

                isProcessing = false;

                if (!usePolling) {
                    console.log("[i] Stop container as usePolling is set to false..");
                    process.exit(0);
                }
            });
    })
    .on("ready", () => {

        // When polling was not set to true (thus runOnce) and there is no file currently being processed, stop the container.
        setTimeout(() => {
            if (!usePolling && !isProcessing) {
                console.log("[i] Found no file to convert, stop container as usePolling is set to false..");
                process.exit(0);
            }
        }, 5000);
    });
