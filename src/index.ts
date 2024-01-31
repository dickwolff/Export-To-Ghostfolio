import { createAndRunConverter } from "./converter";

require("dotenv").config();

// Define import file path.
const inputFile = process.env.INPUT_FILE;

// Determine convertor type and run conversion.
createAndRunConverter(process.argv[2].toLocaleLowerCase(), inputFile, ".", () => { }, () => { });
