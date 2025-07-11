import { SwissquoteConverter } from "./swissquoteConverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { SecurityService } from "../securityService";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("swissquoteConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Act
    const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/swissquote-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(14);

      done();
    }, () => { fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/swissquote-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Create temp file.
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";

      // Act
      sut.processFileContents(tempFileContent, () => { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error occurred while parsing");

        done();
      });
    });

    it("the header and row column count doesn't match", (done) => {

      // Arrange
      const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Create temp file.
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";
      tempFileContent += "16-06-2022 13:14:35;110152600;Sell;VEUD;VANGUARD FTSE EUROPE UCITS ETF;IE00B945VV12;709.0;32.37;115.28;0.00;22835.05;111207.71;USD;;";

      // Act
      sut.processFileContents(tempFileContent, () => { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 13, got 15 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";
      tempFileContent += "16-06-2022 13:14:35;110152600;Sell;VEUD;VANGUARD FTSE EUROPE UCITS ETF;IE00B945VV12;709.0;32.37;115.28;0.00;22835.05;111207.71;USD";

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new SwissquoteConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, (e) => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("Unit test error");

        done();
      });
    });

    it("the export has German language records", (done) => {

      // Arrange
      const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Create temp file.
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";
      tempFileContent += "16-06-2022 13:14:35;110152600;Sell;VEUD;VANGUARD FTSE EUROPE UCITS ETF;IE00B945VV12;709.0;32.37;115.28;0.00;22835.05;111207.71;USD\n";
      tempFileContent += "31-12-2024 11:40:56;00000000;Depotgebühren;;;;1.0;37.50;3.04;0.00;-40.54;CHF;\n";
      tempFileContent += "30-12-2024 00:35:49;00000000;Zahlung;;;;1.0;1000.00;0.00;0.00;1000.00;CHF;\n";

      // Act
      sut.processFileContents(tempFileContent, () => { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("German language records detected. Please make sure to set your Swissquote display language to English!");

        done();
      });
    });
  });

  it("should log when Yahoo Finance returns no symbol", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";
    tempFileContent += "16-06-2022 13:14:35;110152600;Sell;VEUD;VANGUARD FTSE EUROPE UCITS ETF;IE00B945VV12;709.0;32.37;115.28;0.00;22835.05;111207.71;USD";

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new SwissquoteConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for sell action for IE00B945VV12 with currency USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
   
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new SwissquoteConverter(new SecurityService(new YahooFinanceServiceMock()));

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
