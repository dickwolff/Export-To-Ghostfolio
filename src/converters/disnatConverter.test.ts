import { DisnatConverter } from "./disnatConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("disnatConverter", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));

        // Assert
        expect(sut).toBeTruthy();
    });

    it("should process sample CSV file", (done) => {

        // Arrange
        const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));
        const inputFile = "samples/disnat-export.csv";

        // Act
        sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

            // Assert
            expect(actualExport).toBeTruthy();
            expect(actualExport.activities.length).toBeGreaterThan(0);
            expect(actualExport.activities.length).toBe(17);

            done();
        }, () => { done.fail("Should not have an error!"); });
    });

    describe("should throw an error if", () => {
        it("the input file does not exist", (done) => {

            // Arrange
            const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileName = "tmp/testinput/disnat-filedoesnotexist.csv";

            // Act
            sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

                // Assert
                expect(err).toBeTruthy();

                done();
            });
        });

        it("the input file is empty", (done) => {

            // Arrange
            const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileContent = "";
            tempFileContent += "Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte\n";

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
            const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));

            let tempFileContent = "";
            tempFileContent += "Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte\n";
            tempFileContent += `2025-08-01,2025-08-05,VENTE,Actions,CASH-C,GLB X HIGH INT SVGS-A ETF,CAN,-10,50,CAN,0,500,CAN,,\n`;

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
            tempFileContent += "Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte\n";
            tempFileContent += `2025-08-01,2025-08-05,VENTE,Actions,CASH-C,GLB X HIGH INT SVGS-A ETF,CAN,-10,50,CAN,0,500,CAN\n`;

            // Mock Yahoo Finance service to throw error.
            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
            const sut = new DisnatConverter(new SecurityService(yahooFinanceServiceMock));

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
        tempFileContent += "Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte\n";
        tempFileContent += `2025-08-01,2025-08-05,VENTE,Actions,CASH-C,GLB X HIGH INT SVGS-A ETF,CAN,-10,50,CAN,0,500,CAN\n`;

        // Mock Yahoo Finance service to return no quotes.
        const yahooFinanceServiceMock = new YahooFinanceServiceMock();
        jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
        const sut = new DisnatConverter(new SecurityService(yahooFinanceServiceMock));

        // Bit hacky, but it works.
        const consoleSpy = jest.spyOn((sut as any).progress, "log");

        // Act
        sut.processFileContents(tempFileContent, () => {

            expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for sell action for CASH-C with currency CAD! Please add this manually..\n");

            done();
        }, () => done.fail("Should not have an error!"));
    });

    it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {

        // Arrange
        const tempFileContent = "Date de transaction,Date de règlement,Type de transaction,Classe d'actif,Symbole,Description,Marché,Quantité,Prix,Devise du prix,Commission payée,Montant de l'opération,Devise du compte\n";
        const sut = new DisnatConverter(new SecurityService(new YahooFinanceServiceMock()));

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
