import { IbkrConverter } from "./ibkrConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("IbkrConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  describe("should process sample CSV file", () => {
    it("with trades", (done) => {
      // Arange
      const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));
      const inputFile = "samples/ibkr-trades-export.csv";

      // Act
      sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

        // Assert
        expect(actualExport).toBeTruthy();
        expect(actualExport.activities.length).toBeGreaterThan(0);
        expect(actualExport.activities.length).toBe(8); // currently sells are broken. todo: fix

        done();
      }, () => { done.fail("Should not have an error!"); });
    });

    it("with dividends", (done) => {
      // Arange
      const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));
      const inputFile = "samples/ibkr-dividends-export.csv";

      // Act
      sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

        // Assert
        expect(actualExport).toBeTruthy();
        expect(actualExport.activities.length).toBeGreaterThan(0);
        expect(actualExport.activities.length).toBe(5);

        done();
      }, () => { done.fail("Should not have an error!"); });
    });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/ibkr-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;

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
      const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;
      tempFileContent += `"BUY","20230522","CH0111762537","7","282.7","1978.9","CHF","-5","CHF",,`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 9, got 11 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;
      tempFileContent += `"BUY","20230522","CH0111762537","7","282.7","1978.9","CHF","-5","CHF"`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new IbkrConverter(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;
    tempFileContent += `"BUY","20230522","CH0111762537","7","282.7","1978.9","CHF","-5","CHF"`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new IbkrConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for CH0111762537! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
   
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new IbkrConverter(new SecurityService(new YahooFinanceServiceMock()));

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
