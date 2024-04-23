import * as fs from "fs";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";

export abstract class AbstractCsvConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
    }

    /**
     * @inheritdoc
     */
    public readAndProcessFile(inputFile: string, successCallback: CallableFunction, errorCallback: CallableFunction) {

        // If the file does not exist, throw error.
        if (!fs.existsSync(inputFile)) {
            return errorCallback(new Error(`File ${inputFile} does not exist!`));
        }

        const contents = fs.readFileSync(inputFile, "utf-8");

        this.processFileContents(contents, successCallback, errorCallback);
    }

    /**
     * Process export file contents.
     * 
     * @param input The file contents to convert.
     * @param successCallback A callback to execute after processing has succeeded.
     * @param errorCallback A callback to execute after processing has failed.
     */
    abstract processFileContents(input: string, successCallback: CallableFunction, errorCallback: CallableFunction): void;

    /**
     * Retrieve headers from the input file.
     * 
     * @param csvFile The file to extract headers from.
     * @param splitChar The character to split on. Defaults to "," (optional).
     * @returns The header to use for processing.
     */
    protected processHeaders(csvFile: string, splitChar = ","): string[] {

        const csvHeaders = [];

        // Get header line and split in columns.
        const firstLine = csvFile.split('\n')[0];
        const colsInFile = firstLine.split(splitChar);

        for (let idx = 0; idx <= colsInFile.length; idx++) {

            // Ignore empty columns.
            if (!colsInFile[idx]) {
                continue;
            }
            // Replace all charachters except a-z, and camelCase the string.
            let col: string = this.camelize(colsInFile[idx]);

            // Manual polishing..
            if (col === "iSIN") {
                col = col.toLocaleLowerCase();
            } else if (col.endsWith("EUR")) {
                col = col.slice(0, -3) + "Eur";
            } else if (col.endsWith("CHF")) {
                col = col.slice(0, -3) + "Chf";
            }

            csvHeaders.push(col);
        }

        return csvHeaders;
    }

    private camelize(str): string {
        return str.replace(/[^a-zA-Z ]/g, "").replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }
}
