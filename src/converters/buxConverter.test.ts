import { BuxConverter } from "./buxConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("buxConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new BuxConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new BuxConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/bux-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(15);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new BuxConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/bux-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new BuxConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Transaction Time (CET),Transaction Category,Transaction Type,Asset Id,Asset Name,Asset Currency,Transaction Currency,Currency Pair,Exchange Rate,Transaction Amount,Trade Amount,Trade Price,Trade Quantity,Cash Balance Amount,Profit And Loss Amount,Profit And Loss Currency\n`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error ocurred while parsing");

        done();
      });
    });

    it("the header and row column count doesn't match", (done) => {

      // Arrange
      const sut = new BuxConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Transaction Time (CET),Transaction Category,Transaction Type,Asset Id,Asset Name,Asset Currency,Transaction Currency,Currency Pair,Exchange Rate,Transaction Amount,Trade Amount,Trade Price,Trade Quantity,Cash Balance Amount,Profit And Loss Amount,Profit And Loss Currency\n`;
      tempFileContent += `2023-03-21 13:37:29.383000,trades,Buy Trade,NL0011821202,ING,EUR,EUR,EUREUR,1,-542.92,542.92,11.08,49,48.49,,,,`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error ocurred while parsing! Details: Invalid Record Length: columns length is 16, got 18 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `Transaction Time (CET),Transaction Category,Transaction Type,Asset Id,Asset Name,Asset Currency,Transaction Currency,Currency Pair,Exchange Rate,Transaction Amount,Trade Amount,Trade Price,Trade Quantity,Cash Balance Amount,Profit And Loss Amount,Profit And Loss Currency\n`;
      tempFileContent += `2023-03-21 13:37:29.383000,trades,Buy Trade,NL0011821202,ING,EUR,EUR,EUREUR,1,-542.92,542.92,11.08,49,48.49,,`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new BuxConverter(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += `Transaction Time (CET),Transaction Category,Transaction Type,Asset Id,Asset Name,Asset Currency,Transaction Currency,Currency Pair,Exchange Rate,Transaction Amount,Trade Amount,Trade Price,Trade Quantity,Cash Balance Amount,Profit And Loss Amount,Profit And Loss Currency\n`;
    tempFileContent += `2023-03-21 13:37:29.383000,trades,Buy Trade,NL0011821202,ING,EUR,EUR,EUREUR,1,-542.92,542.92,11.08,49,48.49,,`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new BuxConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for NL0011821202 with currency EUR! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
