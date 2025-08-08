import { SecurityService } from "../securityService";
import { CoinbaseConverter } from "./coinbaseConverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("coinbaseConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new CoinbaseConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new CoinbaseConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/coinbase-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(3);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new CoinbaseConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/coinbase-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new CoinbaseConverter(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes\n";

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
      const sut = new CoinbaseConverter(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes\n";
      tempFileContent += "678a8bdefcb176007bfdbXXX,2025-01-17 16:57:02 UTC,Staking Income,ETH,0.000037835729,EUR,€3343.11229989,€0.12649,€0.12649,€0.00,,,"

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 11, got 13 on line 2");

        done();
      });
    });

    it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
    
      // Arrange
      const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
      const sut = new CoinbaseConverter(new SecurityService(new YahooFinanceServiceMock()));

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
