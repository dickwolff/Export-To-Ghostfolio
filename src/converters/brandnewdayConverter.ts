import dayjs from "dayjs";
import { parse } from "csv-parse";
import { AbstractConverter } from "./abstractconverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceRecord from "../models/yahooFinanceRecord";
import { GhostfolioActivity } from "../models/ghostfolioActivity";
import { GhostfolioOrderType } from "../models/ghostfolioOrderType";
import { PdfReader } from "pdfreader";
import { AbstractPdfConverter } from "./abstractPdfConverter";

export class BrandNewDayConverter extends AbstractPdfConverter {

    constructor(yahooFinanceService: YahooFinanceService) {
        super(yahooFinanceService);
    }

    /**
     * @inheritdoc
     */
    public readAndProcessFile(filename: string, successCallback: any, errorCallback: any): void {

        new PdfReader({}).parseFileItems(filename, (e, i) => {
            console.log(e);
            console.log(i);
        })

        successCallback({});
    };

    /**
     * @inheritdoc
     */
    public isIgnoredRecord(record: any): boolean {
        throw new Error("Method not implemented.");
    }
}
