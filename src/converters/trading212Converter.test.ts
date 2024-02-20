import { Trading212Converter } from "./trading212Converter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";

describe("trading212Converter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new Trading212Converter(new YahooFinanceService());

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new Trading212Converter(new YahooFinanceService());
    const inputFile = "sample-trading212-export.csv";

    // Act      
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(7);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new Trading212Converter(new YahooFinanceService());

      let tempFileName = "tmp/testinput/trading212-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new Trading212Converter(new YahooFinanceService());

      let tempFileContent = "";
      tempFileContent += "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee,Currency (Currency conversion fee)\n";

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
      tempFileContent += "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee,Currency (Currency conversion fee)\n";
      tempFileContent += `Market buy,2023-12-18 14:30:03.613,US17275R1023,CSCO,"Cisco Systems",0.0290530000,49.96,USD,1.09303,,"EUR",1.33,"EUR",,,,EOF7504196256,,`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceService = new YahooFinanceService();
      jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new Trading212Converter(yahooFinanceService);

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
    tempFileContent += "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee,Currency (Currency conversion fee)\n";
    tempFileContent += `Market buy,2023-12-18 14:30:03.613,US17275R1023,CSCO,"Cisco Systems",0.0290530000,49.96,USD,1.09303,,"EUR",1.33,"EUR",,,,EOF7504196256,,`;

    // Mock Yahoo Finance service to return null.
    const yahooFinanceService = new YahooFinanceService();
    jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { return null });
    const sut = new Trading212Converter(yahooFinanceService);

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act      
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for US17275R1023 with currency USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
