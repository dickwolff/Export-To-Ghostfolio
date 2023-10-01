import * as cliProgress from "cli-progress";

export abstract class AbstractConverter {

    protected progress: cliProgress.MultiBar;

    constructor() {
        this.progress = new cliProgress.MultiBar(
            {
                stopOnComplete: true,
                forceRedraw: true,
                format: "{bar} {percentage}% | ETA {eta}s | Duration: {duration}s | {value}/{total}"
            },
            cliProgress.Presets.shades_classic);
    }

    /**
     * Process an export file.
     * 
     * @param inputFile The file to convert.
     * @param callback A callback to execute after processing has succeeded.
     */
    abstract processFile(inputFile: string, callback: any): void;

    /**
     * Retrieve headers from the input file.
     * 
     * @param csvFile The file to extract headers from.
     * @returns The header to use for processing.
     */
    protected processHeaders(csvFile: string): string[] {

        const csvHeaders = [];

        // Get header line and split in columns.
        const firstLine = csvFile.split('\n')[0];
        const colsInFile = firstLine.split(',');

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