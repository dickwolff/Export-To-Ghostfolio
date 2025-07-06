import path from "path";
import * as fs from "fs";
import dotenv from "dotenv";
import chokidar from "chokidar";
import * as cacache from "cacache";
import { createAndRunConverter } from "./converter";
import { FileTypeMatcher } from "./helpers/fileTypeMatcher";

dotenv.config();

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
const usePolling = Boolean(`${process.env.USE_POLLING}`) || false;

// Ensure directories exist
if (!fs.existsSync(inputFolder)) {
    fs.mkdirSync(inputFolder, { recursive: true });
    console.log(`[i] Created input directory: ${inputFolder}`);
}
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
    console.log(`[i] Created output directory: ${outputFolder}`);
}

console.log(`[i] Watching ${inputFolder}${usePolling ? " (using polling)" : ""}..`);

let isProcessing = false;

function processFile(filePath: string) {
   
    if (isProcessing) {
        console.log(`[i] Already processing a file, skipping ${path.basename(filePath)}`);
        return;
    }

    isProcessing = true;

    console.log(`[i] Found ${path.basename(filePath)}!`);

    try {
        const fileContents = fs.readFileSync(filePath, "utf-8");

        const converter = FileTypeMatcher.detectFileType(fileContents);

        if (!converter) {
            console.log("[e] Could not determine file type from header");

            // Move file with errors to output folder so it can be fixed manually.
            const errorFilePath = path.join(outputFolder, path.basename(filePath));
            fs.copyFileSync(filePath, errorFilePath);
            fs.rmSync(filePath);
            
            isProcessing = false;
            return;
        }

        console.log(`[i] Determined the file type to be of kind '${converter}'.`);

        // Determine convertor type and run conversion.
        createAndRunConverter(converter, filePath, outputFolder,
            () => {
                // After conversion was successful, remove input file.
                console.log(`[i] Finished converting ${path.basename(filePath)}, removing file..`);
                fs.rmSync(filePath);

                isProcessing = false;

                if (!usePolling) {
                    console.log("[i] Stop container as usePolling is set to false..");
                    process.exit(0);
                }
            }, (err) => {

                console.log("[e] An error occurred while processing.");
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
    } 
    catch (error) {
        console.error(`[e] Error processing file ${filePath}:`, error);
        isProcessing = false;
    }
}

// Manual directory scan (fallback for Docker).
function scanDirectory() {
    if (isProcessing) {
        return;
    }

    try {
        const files = fs.readdirSync(inputFolder)
            .filter(file => file.endsWith('.csv'))
            .map(file => path.join(inputFolder, file))
            .filter(filePath => {
                try {
                    return fs.statSync(filePath).isFile();
                } catch {
                    return false;
                }
            });

        if (files.length > 0) {
            console.log(`[i] Manual scan found ${files.length} file(s): ${files.map(f => path.basename(f)).join(', ')}`);
            processFile(files[0]);
        }
    } 
    catch (error) {
        console.error("[e] Error during directory scan:", error);
    }
}

// Set up chokidar watcher.
chokidar
    .watch(inputFolder, { 
        usePolling: usePolling,
        interval: 1000,
        ignoreInitial: false,
        persistent: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 1000
        }
    })
    .on("add", filePath => {
        console.log(`[i] Chokidar detected file: ${path.basename(filePath)}`);
        processFile(filePath);
    })
    .on("ready", () => {
        console.log("[i] Chokidar watcher is ready");
        
        // Set up manual scanning as fallback (every 5 seconds).
        setInterval(() => {
            scanDirectory();
        }, 5000);

        // When polling was not set to true (thus runOnce) and there is no file currently being processed, stop the container.
        setTimeout(() => {
            if (!usePolling && !isProcessing) {
                console.log("[i] Found no file to convert, stop container as usePolling is set to false..");
                process.exit(0);
            }
        }, 5000);
    })
    .on("error", error => {
        console.error("[e] Chokidar watcher error:", error);
        console.log("[i] Falling back to manual directory scanning only");
    });
