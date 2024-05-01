import { IbkrConverter } from "./ibkrConverter";
import { YahooFinanceService } from "../yahooFinanceService";
import { GhostfolioExport } from "../models/ghostfolioExport";

describe("IbkrConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new IbkrConverter(new YahooFinanceService());

    // Assert
    expect(sut).toBeTruthy();
  });

  describe("should process sample CSV file", () => {
    it("with trades", (done) => {
      // Arange
      const sut = new IbkrConverter(new YahooFinanceService());
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
      const sut = new IbkrConverter(new YahooFinanceService());
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
      const sut = new IbkrConverter(new YahooFinanceService());

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
      const sut = new IbkrConverter(new YahooFinanceService());

      let tempFileContent = "";
      tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;

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
      tempFileContent += `"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n`;
      tempFileContent += `"BUY","20230522","CH0111762537","7","282.7","1978.9","CHF","-5","CHF"`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceService = new YahooFinanceService();
      jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new IbkrConverter(yahooFinanceService);

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

    // Mock Yahoo Finance service to return null.
    const yahooFinanceService = new YahooFinanceService();
    jest.spyOn(yahooFinanceService, "getSecurity").mockImplementation(() => { return null });
    const sut = new IbkrConverter(yahooFinanceService);

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for CH0111762537! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
