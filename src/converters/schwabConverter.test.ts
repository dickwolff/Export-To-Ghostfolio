import { SchwabConverter } from "./schwabConverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";

describe("schwabConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new SchwabConverter(new YahooFinanceService());

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new SchwabConverter(new YahooFinanceService());
    const inputFile = "sample-schwab-export.csv";

    // Act      
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(98);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new SchwabConverter(new YahooFinanceService());

      let tempFileName = "tmp/testinput/schwab-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new SchwabConverter(new YahooFinanceService());

      let tempFileContent = "";
      tempFileContent += `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error ocurred while parsing");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n`;
      tempFileContent += `08/22/2023,Sell,FIHBX,FEDERATED HERMES INSTL HIGH YIELD BD IS,592.199,$8.46,$10.00,"$5,000.00"\n`;
      tempFileContent += `Transactions Total,,,,,,,"-$26,582.91"`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceService = new YahooFinanceService();
      jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new SchwabConverter(yahooFinanceService);

      // Act      
      sut.processFileContents(tempFileContent, (e) => { done.fail("Should not succeed!"); }, (err: Error) => {

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
    tempFileContent += `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n`;
    tempFileContent += `08/22/2023,Sell,FIHBX,FEDERATED HERMES INSTL HIGH YIELD BD IS,592.199,$8.46,$10.00,"$5,000.00"\n`;
    tempFileContent += `Transactions Total,,,,,,,"-$26,582.91"`;

    // Mock Yahoo Finance service to return null.
    const yahooFinanceService = new YahooFinanceService();
    jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { return null });
    const sut = new SchwabConverter(yahooFinanceService);

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act      
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for sell action for FIHBX with currency USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
