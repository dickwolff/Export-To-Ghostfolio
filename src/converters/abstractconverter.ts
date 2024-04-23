import * as fs from "fs";
import * as cliProgress from "cli-progress";
import { YahooFinanceService } from "../yahooFinanceService";

export abstract class AbstractConverter {

    protected yahooFinanceService: YahooFinanceService;
    
    protected progress: cliProgress.MultiBar;

    constructor(yahooFinanceService: YahooFinanceService) {

        this.yahooFinanceService = yahooFinanceService;

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
    abstract readAndProcessFile(inputFile: string, successCallback: CallableFunction, errorCallback: CallableFunction);

    /**
     * Check if a record should be ignored from processing.
     * 
     * @param record The record to check
     * @returns true if the record should be skipped, false otherwise.
     */
    abstract isIgnoredRecord(record: any): boolean;    

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
}
