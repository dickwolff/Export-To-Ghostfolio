import { RevolutConverter } from "./revolutConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("revolutConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  describe("should process sample", () => {
    it("Revolut Invest CSV file", (done) => {

      // Arange
      const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));
      const inputFile = "samples/revolut-invest-export.csv";

      // Act
      sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

        // Assert
        expect(actualExport).toBeTruthy();
        expect(actualExport.activities.length).toBeGreaterThan(0);
        expect(actualExport.activities.length).toBe(7);
        actualExport.activities.forEach(activity => {
          expect(activity.unitPrice).not.toBeNaN();
          expect(activity.quantity).not.toBeNaN();
        })

        done();
      }, () => { done.fail("Should not have an error!"); });
    });

    it("Revolut Crypto CSV file", (done) => {

      // Arange
      const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));
      const inputFile = "samples/revolut-crypto-export.csv";

      // Act
      sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

        // Assert
        expect(actualExport).toBeTruthy();
        expect(actualExport.activities.length).toBeGreaterThan(0);
        expect(actualExport.activities.length).toBe(6); // Currently only 5 because of BTC-SEK not existing.

        done();
      }, () => { done.fail("Should not have an error!"); });
    });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/revolut-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n`;

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
      const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n`;
      tempFileContent += `2023-09-22T13:30:10.514Z,O,BUY - MARKET,1.63453043,$52.07,$85.11,USD,1.0665,,`;

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
      tempFileContent += `Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n`;
      tempFileContent += `2023-09-22T13:30:10.514Z,O,BUY - MARKET,1.63453043,$52.07,$85.11,USD,1.0665`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new RevolutConverter(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += `Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate\n`;
    tempFileContent += `2023-09-22T13:30:10.514Z,O,BUY - MARKET,1.63453043,$52.07,$85.11,USD,1.0665`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new RevolutConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for O with currency USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
   
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new RevolutConverter(new SecurityService(new YahooFinanceServiceMock()));

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
