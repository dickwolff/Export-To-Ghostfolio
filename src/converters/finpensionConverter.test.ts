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
    const inputFile = "samples/finpension-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(24);

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
        expect(err.message).toContain("An error ocurred while parsing");

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
        expect(err.message).toBe("An error ocurred while parsing! Details: Invalid Record Length: columns length is 10, got 12 on line 2");

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
});
