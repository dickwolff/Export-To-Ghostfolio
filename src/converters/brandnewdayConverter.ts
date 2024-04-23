import * as fs from "fs";
import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
// import { PdfReader } from "pdfreader";
import { AbstractPdfConverter } from "./abstractPdfConverter";

import { getDocument } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";

export class BrandNewDayConverter extends AbstractPdfConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
    }

    /**
     * @inheritdoc
     */
    public readAndProcessFile(filename: string, successCallback: any, errorCallback: any): void {

        if (!fs.existsSync(filename)) {
            return errorCallback(new Error(`File ${filename} does not exist!`));
        }
        // const items = [];
        // new PdfReader({}).parseFileItems(filename, (err, item) => {
        //     if (err) errorCallback(err);
        //     else if (!item) console.log("Leeg");
        //     else if (item.text) items.push(item);
        // });
        // console.log(items)

        getDocument(filename).promise.then(async (pdf) => {

            //for (let idx = 0; idx < pdf.numPages; idx++) {
            const page = await pdf.getPage(1);

            const textContent = await page.getTextContent();
            let lines = [];
            let lastLine = "";
            let skipColumnBreak = false;
            for (let itm = 0; itm < textContent.items.length; itm++) {
                const item = textContent.items[itm] as TextItem;

                // Remove all parsed data before this. Next line will contain transaction data.
                if (item.str == "Beleggingstransacties") {
                    lines = [];
                    lastLine = "";
                    continue;
                }

                // Skip spaces
                if (item.str == " ") {
                    continue;
                }

                // Skip line breaks on multi row fields
                if (item.str == "" && item.transform[4] > 50) {
                    // console.log(lastLine)
                    // console.log(item)
                    skipColumnBreak = true;
                    continue;
                }

                // Add to temporary line.
                if (!item.hasEOL) {
                    lastLine += `${item.str}${skipColumnBreak ? ' ' : ';'}`;

                    if (skipColumnBreak) {
                        skipColumnBreak = false;
                    }
                }

                // When end of line is found, add completed line to result and clear temporary line.
                if (item.hasEOL) {
                    lines.push(lastLine.trim());
                    lastLine = "";
                }
            }

            console.log(lines)

            return successCallback({});
        });


    };

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: any): boolean {
        throw new Error("Method not implemented.");
    }
}
