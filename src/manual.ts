import { createAndRunConverter } from "./converter";

// Check if converter was specified.
if (process.argv.length != 3) {
    console.log("[e] Invalid run command: converter not specified!");;
}
else {

    require("dotenv").config();

    // Define import file path.
    const inputFile = process.env.INPUT_FILE;

    // Determine convertor type and run conversion.
    createAndRunConverter(
        process.argv[2].toLocaleLowerCase(),
        inputFile,
        ".",
        () => { process.exit(0); },
        (error) => {
            console.log(`[e] Error details: ${error}`);
            process.exit(99);
        }
    );
}
