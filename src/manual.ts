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
    const outputFolder = process.env.E2G_OUTPUT_FOLDER || "e2g-output";

    // Check if the outputFolder exists, if not create it.
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    let converter = process.argv[2].toLocaleLowerCase();

    // Temporary flag to force DEGIRO V3.
    if (converter === "degiro" && `${process.env.DEGIRO_FORCE_V3}` === "true") {
        console.log("[i] Using DEGIRO V3 Beta converter because DEGIRO_FORCE_V3 was set to true..");
        converter = "degiro-v3";
    }

    // Determine convertor type and run conversion.
    createAndRunConverter(
        converter,
        inputFile,
        outputFolder,
        () => { process.exit(0); },
        (err) => {
            console.log("[e] An error occurred processing.");
            console.log(`[e] ${err}`);
            process.exit(99);
        }
    );
}
