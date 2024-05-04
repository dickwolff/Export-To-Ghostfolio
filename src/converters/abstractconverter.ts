import * as fs from "fs";
import * as cliProgress from "cli-progress";
import { SecurityService } from "../securityService";

export abstract class AbstractConverter {

    protected securityService: SecurityService;
    
    protected progress: cliProgress.MultiBar;

    constructor(securityService: SecurityService) {

        this.securityService = securityService;

        this.progress = new cliProgress.MultiBar(
            {
                stopOnComplete: true,
                forceRedraw: true,
                format: "{bar} {percentage}% | ETA {eta}s | Duration: {duration}s | {value}/{total}"
            },
            cliProgress.Presets.shades_classic);
    }

    /**
     * Read and process the file.
     * 
     * @param inputFile The file to convert.
     * @param successCallback A callback to execute after processing has succeeded.
     * @param errorCallback A callback to execute after processing has failed.
     */
    public readAndProcessFile(inputFile: string, successCallback: CallableFunction, errorCallback: CallableFunction) {

        // If the file does not exist, throw error.
        if (!fs.existsSync(inputFile)) {
            return errorCallback(new Error(`File ${inputFile} does not exist!`));
        }

        const contents = fs.readFileSync(inputFile, "utf-8");

        this.processFileContents(contents,successCallback, errorCallback);
    }

    /**
     * Check if a record should be ignored from processing.
     * 
     * @param record The record to check
     * @returns true if the record should be skipped, false otherwise.
     */
    abstract isIgnoredRecord(record: any): boolean;    

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

    /**
     * Log a query error.
     * 
     * @param query The query that was looked for.
     * @param index The index of the line in the input file.
     */
    protected logQueryError(query: string, index: number) {
        
        let message = `\n[e] An error ocurred while trying to retrieve {query} (line ${index + 2})!\n`;
        
        if (query) {
            message = message.replace("{query}", `symbol ${query}`);
        } else {
            message = message.replace("{query}", `an empty symbol`);
        }

        console.log(message);    
    }
    
    private camelize(str): string {
        return str.replace(/[^a-zA-Z ]/g, "").replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
    }
}
