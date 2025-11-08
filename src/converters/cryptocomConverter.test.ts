import { CryptoComConverter } from "./cryptocomConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("cryptocomConverter", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Assert
        expect(sut).toBeTruthy();
    });

    it("should process sample CSV file", (done) => {

        // Arange
        const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));
        const inputFile = "samples/cryptocom-export.csv";

        // Act
        sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport).toBeTruthy();
            expect(actualExport.activities.length).toBeGreaterThan(0);
            expect(actualExport.activities.length).toBe(53);

            done();
        }, () => { done.fail("Should not have an error!"); });
    });

    describe("should throw an error if", () => {
        it("the input file does not exist", (done) => {

            // Arrange
            const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileName = "tmp/testinput/cryptocom-filedoesnotexist.csv";

            // Act
            sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();

                done();
            });
        });

        it("the input file is empty", (done) => {

            // Arrange
            const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileContent = "";
            tempFileContent += "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash\n";

            // Act
            sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("An error occurred while parsing");

                done();
            });
        });

        it("the header and row column count doesn't match", (done) => {

            // Arrange
            const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileContent = "";
            tempFileContent += "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash\n";
            tempFileContent += `2025-01-07 11:43:48,EGLD -> USDC,EGLD,-4.15,USDC,150.865358,EUR,143.33016114556153037260009689941121,169.3696337724427464682749300795884857180596,crypto_exchange,,,`;

            // Act
            sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 13, got 15 on line 2");

                done();
            });
        });

        it("Yahoo Finance throws an error", (done) => {

            // Arrange
            let tempFileContent = "";
            tempFileContent += "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash\n";
            tempFileContent += `2025-01-07 11:43:48,EGLD -> USDC,EGLD,-4.15,USDC,150.865358,EUR,143.33016114556153037260009689941121,169.3696337724427464682749300795884857180596,crypto_exchange,`;

            // Mock Yahoo Finance service to throw error.
            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
            const sut = new CryptoComConverter(new SecurityService(yahooFinanceServiceMock));

            // Act
            sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();
                expect(err.message).toContain("Unit test error");

                done();
            });
        });
    });

    it("should log when Yahoo Finance returns no symbol", (done) => {

        // Arrange
        let tempFileContent = "";
        tempFileContent += "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash\n";
        tempFileContent += `2025-01-07 11:43:48,EGLD -> USDC,EGLD,-4.15,USDC,150.865358,EUR,143.33016114556153037260009689941121,169.3696337724427464682749300795884857180596,crypto_exchange,`;

        // Mock Yahoo Finance service to return no quotes.
        const yahooFinanceServiceMock = new YahooFinanceServiceMock();
        jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
        const sut = new CryptoComConverter(new SecurityService(yahooFinanceServiceMock));

        // Bit hacky, but it works.
        const consoleSpy = jest.spyOn((sut as any).progress, "log");

        // Act
        sut.processFileContents(tempFileContent, () => {

            expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for EGLD-USDC! Please add this manually..\n");

            done();
        }, () => done.fail("Should not have an error!"));
    });

    it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {

        // Arrange
        const tempFileContent = "Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind,Transaction Hash\n";
        const sut = new CryptoComConverter(new SecurityService(new YahooFinanceServiceMock()));

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
