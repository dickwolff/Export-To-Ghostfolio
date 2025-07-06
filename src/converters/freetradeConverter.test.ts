import { FreetradeConverter } from "./freetradeConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("freetradeConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new FreetradeConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new FreetradeConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/freetrade-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport, err: Error) => {

      // Assert
      expect(err).toBeFalsy();
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(9);

      done();
    }, (err: any) => { done(err); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new FreetradeConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/freetrade-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new FreetradeConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += "Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount\n";

      // Act
      sut.processFileContents(tempFileContent, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error occurred while parsing");

        done();
      });
    });
    
    it("the header and row column count doesn't match", (done) => {

      // Arrange
      const sut = new FreetradeConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += "Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount\n";
      tempFileContent += `Apple,DIVIDEND,2024-02-15T17:39:00.000Z,GBP,6.78,,AAPL,US0378331005,,,41.83076059,,,,USD,,,,0.79485569,0,0.00,2024-02-09,2024-02-15,41.83076059,0.24000000,10.04,8.53,15,1.51,,`;

      // Act
      sut.processFileContents(tempFileContent, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 29, got 31 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += "Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount\n";
      tempFileContent += `Apple,DIVIDEND,2024-02-15T17:39:00.000Z,GBP,6.78,,AAPL,US0378331005,,,41.83076059,,,,USD,,,,0.79485569,0,0.00,2024-02-09,2024-02-15,41.83076059,0.24000000,10.04,8.53,15,1.51`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new FreetradeConverter(new SecurityService(yahooFinanceServiceMock));

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
    let tempFileContent = "";
    tempFileContent += "Title,Type,Timestamp,Account Currency,Total Amount,Buy / Sell,Ticker,ISIN,Price per Share in Account Currency,Stamp Duty,Quantity,Venue,Order ID,Order Type,Instrument Currency,Total Shares Amount,Price per Share,FX Rate,Base FX Rate,FX Fee (BPS),FX Fee Amount,Dividend Ex Date,Dividend Pay Date,Dividend Eligible Quantity,Dividend Amount Per Share,Dividend Gross Distribution Amount,Dividend Net Distribution Amount,Dividend Withheld Tax Percentage,Dividend Withheld Tax Amount\n";
    tempFileContent += `Cisco,ORDER,2024-03-04T11:01:19.356Z,GBP,992.50,BUY,,US17275R1023,99.25000000,0.00,10.00000000,London Stock Exchange,DJXPPWUNIUCR,BASIC,USD,992.50,99.25000000,,,0,,,,,,,,,`

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new FreetradeConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for US17275R1023 with currency USD! Please add this manually..\n");

      done();
    }, () => done("Should not have an error!"));
  });
});
