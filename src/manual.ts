import dotenv from "dotenv";
import { createAndRunConverter } from "./converter";
import fs from "fs";

// Check if converter was specified.
if (process.argv.length != 3) {
    console.log("[e] Invalid run command: converter not specified!");;
}
else {

    dotenv.config();

    // Define import file path.
    const inputFile = process.env.INPUT_FILE;
    const outputFolder = process.env.E2G_OUTPUT_FOLDER || "tmp/e2g-output";

    // Check if the outputFolder exists, if not create it.
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    // Determine convertor type and run conversion.
    createAndRunConverter(
        process.argv[2].toLocaleLowerCase(),
        inputFile,
        outputFolder,
        () => { process.exit(0); },
        (error) => {
            console.log(`[e] Error details: ${error}`);
            process.exit(99);
        }
    );
}
