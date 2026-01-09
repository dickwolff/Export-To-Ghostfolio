import { FinpensionConverter } from "./finpensionConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("finpensionConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/finpension-3a-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(25);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/finpension-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;

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
      const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
      tempFileContent += `2023-07-11;Buy;"CSIF (CH) Bond Corporate Global ex CHF Blue ZBH";CH0189956813;0.001000;CHF;1.000000;821.800000;-0.821800;16.484551;;`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 10, got 12 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
      tempFileContent += `2023-07-11;Buy;"CSIF (CH) Bond Corporate Global ex CHF Blue ZBH";CH0189956813;0.001000;CHF;1.000000;821.800000;-0.821800;16.484551`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new FinpensionConverter(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
    tempFileContent += `2023-07-11;Buy;"CSIF (CH) Bond Corporate Global ex CHF Blue ZBH";CH0189956813;0.001000;CHF;1.000000;821.800000;-0.821800;16.484551`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new FinpensionConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for CH0189956813 with currency CHF! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

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

  it("should process interests records", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
    tempFileContent += `2025-01-07;Interests;;;;CHF;1.0000000000;;0.450000;200.988502\n`;
    tempFileContent += `2025-04-07;Interests;;;;CHF;1.0000000000;;0.230000;201.218502`;

    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(2);

      expect(actualExport.activities[0].type).toBe("INTEREST");
      expect(actualExport.activities[0].unitPrice).toBe(0.450000);
      expect(actualExport.activities[0].fee).toBe(0);
      expect(actualExport.activities[0].quantity).toBe(1);
      expect(actualExport.activities[0].currency).toBe("CHF");
      expect(actualExport.activities[0].dataSource).toBe("MANUAL");
      expect(actualExport.activities[0].symbol).toBe("interest");

      expect(actualExport.activities[1].type).toBe("INTEREST");
      expect(actualExport.activities[1].unitPrice).toBe(0.230000);
      expect(actualExport.activities[1].fee).toBe(0);
      expect(actualExport.activities[1].quantity).toBe(1);
      expect(actualExport.activities[1].currency).toBe("CHF");
      expect(actualExport.activities[1].dataSource).toBe("MANUAL");
      expect(actualExport.activities[1].symbol).toBe("interest");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should process sample BVG CSV file", (done) => {

    // Arange
    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/finpension-bvg-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(10);

      done();
    }, (error) => {
      console.error("Error processing BVG file:", error);
      done(error);
    });
  });

  it("should process Portfolio Transaction as buy when cash flow is negative", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
    tempFileContent += `2024-10-22;"Portfolio Transaction";"UBS (CH) Index Fund 3 - Equities World ex CH NSL I-X-acc";CH0429081620;0.155000;CHF;1.0000000000;1690.560000;-262.036800;6.653200`;

    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1);

      expect(actualExport.activities[0].type).toBe("BUY");
      expect(actualExport.activities[0].quantity).toBe(0.155000);
      expect(actualExport.activities[0].unitPrice).toBe(1690.560000);
      expect(actualExport.activities[0].currency).toBe("CHF");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should process Portfolio Transaction as sell when cash flow is positive", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
    tempFileContent += `2024-10-22;"Portfolio Transaction";"UBS (CH) Index Fund 3 - Equities World ex CH NSL I-X-acc";CH0429081620;0.155000;CHF;1.0000000000;1690.560000;262.036800;6.653200`;

    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1);

      expect(actualExport.activities[0].type).toBe("SELL");
      expect(actualExport.activities[0].quantity).toBe(0.155000);
      expect(actualExport.activities[0].unitPrice).toBe(1690.560000);
      expect(actualExport.activities[0].currency).toBe("CHF");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should ignore transfer vested benefits records", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date;Category;"Asset Name";ISIN;"Number of Shares";"Asset Currency";"Currency Rate";"Asset Price in CHF";"Cash Flow";Balance\n`;
    tempFileContent += `2024-10-16;"Transfer vested benefits";;;0.000000;CHF;1.0000000000;0.000000;268.690000;268.690000\n`;
    tempFileContent += `2025-01-07;Interests;;;;CHF;1.0000000000;;0.450000;269.140000`;

    const sut = new FinpensionConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1); // Only interest, transfer is ignored
      expect(actualExport.activities[0].type).toBe("INTEREST");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
