import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";

export abstract class AbstractPdfConverter extends AbstractConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
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
}
