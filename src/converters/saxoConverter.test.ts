import { SaxoConverter } from "./saxoConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("saxoConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/saxo-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(18);

      done();
    }, () => { done(new Error("Should not have an error!")); });
  });

  it("should process sample CSV file in Dutch", (done) => {

    //Default in English - should fail
    // Arange
    const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/saxo-nl-export.csv";

    process.env.IMPORT_LOCALE = 'en';

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      expect(actualExport).toBeTruthy();

      for (let idx = 0; idx < actualExport.activities.length; idx++) {
        expect(actualExport.activities[idx].date).toBe('Invalid Date');
      }

    }, (err: Error) => {

      // Assert
      expect(err).toBeTruthy();

      done();
    });

    // Change locale to Dutch
    process.env.IMPORT_LOCALE = 'nl';

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(18);

      done();
    }, (err: Error) => {

      // Assert
      expect(err).toBeTruthy();

      done();
    });

  });


  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/saxo-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done(new Error("Should not succeed!")); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Booked Amount,Order ID,Conversion Rate,From Derivative,Underlying asset type\n`;

      // Act
      sut.processFileContents(tempFileContent,
        () => {
          // This branch should not be executed; if it is, the test must fail
          done(new Error("Should not succeed!"));
        },
        (err: Error) => {
          // Assert
          try {
            expect(err).toBeTruthy();
            expect(err.message).toBe("An error occurred while parsing!");

            // If the assertions above pass, finish the test successfully
            done();
          } catch (error) {
            // If an expectation fails, pass the error to done to fail the test immediately
            done(error);
          }
        }
      );
    });

    it("the header and row column count doesn't match", (done) => {

      // Arrange
      const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Booked Amount,Order ID,Conversion Rate,From Derivative,Underlying asset type\n`;
      // Invalid entry - Too little values (13) instead of (15)
      tempFileContent += `123455,20-feb-2026,24-feb-2026,Trade,iShares Core MSCI Europe EUR (Acc) UCITS ETF,IE00B4K48X80,EUR,Euronext Amsterdam,IMAE:xams,Buy 100 @ 99.68 EUR,"-9979,46",5333305687,1`;

      // Act
      sut.processFileContents(tempFileContent,
        () => {
          // This branch should not be reached; fail the test if it is
          done(new Error("Should not succeed!"));
        },
        (err: Error) => {
          // Assert
          try {
            expect(err).toBeTruthy();
            expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 15, got 13 on line 2");

            // If assertions pass, finish the test
            done();
          } catch (error) {
            // If an expectation fails, catch the error and pass it to done() to fail the test immediately
            done(error);
          }
        }
      );

    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Booked Amount,Order ID,Conversion Rate,From Derivative,Underlying asset type\n`;
      tempFileContent += `123455,20-feb-2026,24-feb-2026,Trade,iShares Core MSCI Europe EUR (Acc) UCITS ETF,IE00B4K48X80,EUR,Euronext Amsterdam,IMAE:xams,Buy 100 @ 99.68 EUR,"-9979,46",5333305687,1,No,`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new SaxoConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, () => { done(new Error("Should not succeed!")); }, (err: Error) => {

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
    tempFileContent += `Client ID,Trade Date,Value Date,Type,Instrument,Instrument ISIN,Instrument currency,Exchange Description,Instrument Symbol,Event,Booked Amount,Order ID,Conversion Rate,From Derivative,Underlying asset type\n`;
    tempFileContent += `12345,30-Dec-2024,02-Jan-2025,Trade,Vanguard FTSE All-World UCITS ETF,IE00BK5BQT80,USD,London Stock Exchange (ETFs),VWRA:xlon,Buy 3 @ 139.74 USD,"-422,99",12345,1,No,`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new SaxoConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for VWRA with currency USD! Please add this manually..\n");

      done();
    }, () => done(new Error("Should not have an error!")));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {

    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new SaxoConverter(new SecurityService(new YahooFinanceServiceMock()));

    const consoleSpy = jest.spyOn(console, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {
      done(new Error("Should not succeed!"));
    }, (err: Error) => {

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("[e] An error occurred while processing the file contents. Stack trace:");
      expect(consoleSpy).toHaveBeenCalledWith(err.stack);
      expect(err).toBeTruthy();

      done();
    });
  });
});
