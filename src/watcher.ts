import * as fs from "fs";
import chokidar from "chokidar";
import * as matcher from "closest-match";
import { createAndRunConverter } from "./converter";

// Define input and output.
const inputFolder = process.env.E2G_INPUT_FOLDER || "/var/e2g-input";
const outputFolder = process.env.E2G_OUTPUT_FOLDER || "/var/e2g-output";

console.log(`[i] Watching ${inputFolder}..\n`);

chokidar.watch(inputFolder, { usePolling: true }).on("add", path => {

    console.log(`[i] Found ${path}!`);

    const fileContents = fs.readFileSync(path, "utf-8");

    const closestMatch = matcher.closestMatch(fileContents.split("\n")[0], [...headers.keys()]);

    let converterKey = closestMatch as string;

    // If multiple matches were found (type would not be 'string'), pick the first.
    if (typeof closestMatch !== "string") {
        converterKey = closestMatch[0];
    }

    const converter = headers.get(converterKey);
    console.log(`[i] Determined the file type to be of kind '${converter}'.`);

    // Determine convertor type and run conversion.
    createAndRunConverter(converter, path, outputFolder, () => {

        // After conversion was succesful, remove input file.
        console.log(`[i] Finished converting ${path}, removing file..\n\n`);
        fs.rmSync(path);
    }, () => { });

});

// Prep header set.
const headers: Map<string, string> = new Map<string, string>();
headers.set(`Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id`, "degiro");
headers.set(`Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance`, "finpension");
headers.set(`Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount`, "schwab");
headers.set(`Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency`, "swissquote");
headers.set(`Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee`, "trading212");
