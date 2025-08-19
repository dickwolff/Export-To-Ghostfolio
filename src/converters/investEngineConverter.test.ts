import { InvestEngineConverter } from "./investEngineConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("investEngineConverter", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Assert
        expect(sut).toBeTruthy();
    });

    it("should process sample CSV file", (done) => {

        // Arrange
        const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));
        const inputFile = "samples/investengine-export.csv";

        // Act
        sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport).toBeTruthy();
            expect(actualExport.activities.length).toBeGreaterThan(0);
            expect(actualExport.activities.length).toBe(5);

            done();
        }, () => { done.fail("Should not have an error!"); });
    });

    describe("should throw an error if", () => {
        it("the input file does not exist", (done) => {

            // Arrange
            const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileName = "tmp/testinput/investengine-filedoesnotexist.csv";

            // Act
            sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();

                done();
            });
        });

        it("the input file is empty", (done) => {

            // Arrange
            const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));

            // Act
            sut.processFileContents("", () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("An error occurred while parsing!");

                done();
            });
        });

        it("the header and row column count doesn't match", (done) => {

            // Arrange
            const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileContent = "";
            tempFileContent += `Security / ISIN,Transaction Type,Quantity,Share Price,Total Trade Value,Trade Date/Time,Settlement Date,Broker\n`;
            tempFileContent += `Vanguard FTSE All-World / ISIN IE00BK5BQT80,Buy,2.699055,£110.79,£299.04,23/12/24 15:18:12,27/12/24,None,,`;

            // Act
            sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 8, got 10 on line 2");

                done();
            });
        });

        it("Yahoo Finance throws an error", (done) => {

            // Arrange
            let tempFileContent = "";
            tempFileContent += `Security / ISIN,Transaction Type,Quantity,Share Price,Total Trade Value,Trade Date/Time,Settlement Date,Broker\n`;
            tempFileContent += `Vanguard FTSE All-World / ISIN IE00BK5BQT80,Buy,2.699055,£110.79,£299.04,23/12/24 15:18:12,27/12/24,None`;

            // Mock Yahoo Finance service to throw error.
            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
            const sut = new InvestEngineConverter(new SecurityService(yahooFinanceServiceMock));

            // Act
            sut.processFileContents(tempFileContent, (e) => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("Unit test error");

                done();
            });
        });

        it("should log when Yahoo Finance returns no symbol", (done) => {

            // Arrange
            let tempFileContent = "";
            tempFileContent += `Security / ISIN,Transaction Type,Quantity,Share Price,Total Trade Value,Trade Date/Time,Settlement Date,Broker\n`;
            tempFileContent += `Vanguard FTSE All-World / ISIN IE00BK5BQT81,Buy,2.699055,£110.79,£299.04,23/12/24 15:18:12,27/12/24,None`;

            // Mock Yahoo Finance service to return no quotes.
            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
            const sut = new InvestEngineConverter(new SecurityService(yahooFinanceServiceMock));

            // Bit hacky, but it works.
            const consoleSpy = jest.spyOn((sut as any).progress, "log");

            // Act
            sut.processFileContents(tempFileContent, () => {

                expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for sell action for IE00BK5BQT80 with currency GBP! Please add this manually..\n");

                done();
            }, () => done.fail("Should not have an error!"));
        });

        it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {

            // Arrange
            const tempFileContent = "Security / ISIN,Transaction Type,Quantity,Share Price,Total Trade Value,Trade Date/Time,Settlement Date,Broker\n";
            const sut = new InvestEngineConverter(new SecurityService(new YahooFinanceServiceMock()));

            const consoleSpy = jest.spyOn(console, "log");

            // Act
            sut.processFileContents(tempFileContent, () => {
                done.fail("Should not succeed!");
            }, (err: Error) => {

                // Assert
                expect(consoleSpy).toHaveBeenCalledWith("[e] An error occurred while processing the file contents. Stack trace:");
                expect(consoleSpy).toHaveBeenCalledWith(err.stack);
                expect(err).toBeTruthy();

                done();
            });
        });
    });
});
