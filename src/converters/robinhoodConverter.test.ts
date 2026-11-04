import { RobinhoodConverter } from "./robinhoodConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("robinhoodConverter", () => {

    const header = `"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n`;

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Assert
        expect(sut).toBeTruthy();
    });

    it("should process sample CSV file", (done) => {

        // Arrange
        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));
        const inputFile = "samples/robinhood-export.csv";

        // Act
        sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport).toBeTruthy();
            expect(actualExport.activities.length).toBe(5);

            const sell = actualExport.activities.find(a => a.type === "SELL");
            expect(sell.symbol).toBe("AMD");
            expect(sell.quantity).toBe(3);
            expect(sell.unitPrice).toBe(150);

            done();
        }, () => { done.fail("Should not have an error!"); });
    });

    it("should add withheld tax as fee to the dividend", (done) => {

        // Arrange
        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));
        const inputFile = "samples/robinhood-export.csv";

        // Act
        sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

            // Assert
            const dividend = actualExport.activities.find(a => a.type === "DIVIDEND" && a.symbol === "AVGO");
            expect(dividend.quantity).toBe(11.25422);
            expect(dividend.unitPrice).toBeCloseTo(7.32 / 11.25422, 6);
            expect(dividend.fee).toBeCloseTo(1.10, 2);

            done();
        }, () => { done.fail("Should not have an error!"); });
    });

    it("should skip a dividend without an amount", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30 new dividend GB nra tax withhold","NRAT","","","($0.40)"\n`;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30","CDIV","","",""\n`;

        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Act
        sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport.activities.length).toBe(0);

            done();
        }, () => done("Should not have an error!"));
    });

    it("should not divide the withheld tax by a dividend total of zero", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30 new dividend GB nra tax withhold","NRAT","","","($0.40)"\n`;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30","CDIV","","","$3.00"\n`;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30","CDIV","","","($3.00)"\n`;

        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Act
        sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport.activities.map(a => a.fee)).toEqual([0, 0]);

            done();
        }, () => done("Should not have an error!"));
    });

    it("should split withheld tax over dividends of the same instrument on the same day", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30 new dividend GB nra tax withhold","NRAT","","","($0.40)"\n`;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30","CDIV","","","$3.00"\n`;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.10","CDIV","","","$1.00"\n`;

        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Act
        sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport.activities.map(a => a.fee)).toEqual([expect.closeTo(0.30, 6), expect.closeTo(0.10, 6)]);

            done();
        }, () => done("Should not have an error!"));
    });

    it("should not search for the description of a dividend", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: R/D 2026-09-07 P/D 2026-09-14 - 10 shares at 0.30","CDIV","","","$3.00"\n`;

        const yahooFinanceServiceMock = new YahooFinanceServiceMock();
        const searchSpy = jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
        const sut = new RobinhoodConverter(new SecurityService(yahooFinanceServiceMock));

        // Act
        sut.processFileContents(tempFileContent, () => {

            // Assert
            const queries = new Set(searchSpy.mock.calls.map(call => call[0]));
            expect(queries).toEqual(new Set(["GOOGL"]));

            done();
        }, () => done("Should not have an error!"));
    });

    describe("should throw an error if", () => {

        it("the input file does not exist", (done) => {

            // Arrange
            const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

            // Act
            sut.readAndProcessFile("tmp/testinput/robinhood-filedoesnotexist.csv", () => { done("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();

                done();
            });
        });

        it("the input file is empty", (done) => {

            // Arrange
            const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));

            // Act
            sut.processFileContents(header, () => { done("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("An error occurred while parsing");

                done();
            });
        });

        it("Yahoo Finance throws an error", (done) => {

            // Arrange
            let tempFileContent = header;
            tempFileContent += `"9/14/2026","9/14/2026","9/15/2026","NVDA","NVIDIA\nCUSIP: 67066G104","Buy","5","$180.00","($900.00)"\n`;

            // Mock Yahoo Finance service to throw error.
            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
            const sut = new RobinhoodConverter(new SecurityService(yahooFinanceServiceMock));

            // Act
            sut.processFileContents(tempFileContent, () => { done("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("Unit test error");

                done();
            });
        });
    });

    it("should log when Yahoo Finance returns no symbol", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/14/2026","9/14/2026","9/15/2026","NVDA","NVIDIA\nCUSIP: 67066G104","Buy","5","$180.00","($900.00)"\n`;

        // Mock Yahoo Finance service to return no quotes.
        const yahooFinanceServiceMock = new YahooFinanceServiceMock();
        jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
        const sut = new RobinhoodConverter(new SecurityService(yahooFinanceServiceMock));

        // Bit hacky, but it works.
        const consoleSpy = jest.spyOn((sut as any).progress, "log");

        // Act
        sut.processFileContents(tempFileContent, () => {

            // Assert
            expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for NVDA with currency USD! Please add this manually..\n");

            done();
        }, () => done("Should not have an error!"));
    });

    it("should log when the number of shares of a dividend can not be determined", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/9/2026","9/9/2026","9/9/2026","GOOGL","Cash Div: unexpected description","CDIV","","","$3.51"\n`;

        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));
        const consoleSpy = jest.spyOn((sut as any).progress, "log");

        // Act
        sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport.activities.length).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith("[i] Could not determine the number of shares for the dividend of GOOGL on 9/9/2026! Please add this manually..\n");

            done();
        }, () => done("Should not have an error!"));
    });

    it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {

        // Arrange
        let tempFileContent = header;
        tempFileContent += `"9/14/2026","9/14/2026","9/15/2026","NVDA","NVIDIA\nCUSIP: 67066G104","Buy","5","$180.00","($900.00)"\n`;

        const sut = new RobinhoodConverter(new SecurityService(new YahooFinanceServiceMock()));
        jest.spyOn(sut as any, "isIgnoredRecord").mockImplementation(() => { throw new Error("Unit test error"); });

        // Act
        sut.processFileContents(tempFileContent, () => done("Should not succeed!"), (err: Error) => {

            // Assert
            expect(err.message).toBe("Unit test error");

            done();
        });
    });
});
