import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";
import { ScalableCapitalConverter } from "./scalableCapitalConverter";

describe("scalableCapitalConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/scalablecapital-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(24);

      done();
    }, () => { throw new Error("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/scalable-capital-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { throw new Error("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n`;

      // Act
      sut.processFileContents(tempFileContent, () => { throw new Error("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error occurred while parsing");

        done();
      });
    });

    it("the header and row column count doesn't match", (done) => {

      // Arrange
      const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n`;
      tempFileContent += `2025-09-25;02:00:00;Executed;"WWEK 51597383";"iShares Core FTSE 100 (Dist)";Cash;Distribution;IE0005042456;;;56,78;0,00;0,00;EUR;;`;

      // Act
      sut.processFileContents(tempFileContent, () => { throw new Error("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 14, got 16 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n`;
      tempFileContent += `2025-09-25;02:00:00;Executed;"WWEK 51597383";"iShares Core FTSE 100 (Dist)";Cash;Distribution;IE0005042456;;;56,78;0,00;0,00;EUR`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new ScalableCapitalConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, () => { throw new Error("Should not succeed!"); }, (err: Error) => {

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
    tempFileContent += `date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n`;
      tempFileContent += `2025-09-25;02:00:00;Executed;"WWEK 51597383";"iShares Core FTSE 100 (Dist)";Cash;Distribution;IE0005042456;;;56,78;0,00;0,00;EUR`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new ScalableCapitalConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for dividend action for IE0005042456 with currency EUR! Please add this manually..\n");

      done();
    }, () => { throw new Error("Should not have an error!"); });
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
 
    // Arrange
    const tempFileContent = "date;time;status;reference;description;assetType;type;isin;shares;price;amount;fee;tax;currency\n";
    const sut = new ScalableCapitalConverter(new SecurityService(new YahooFinanceServiceMock()));

    const consoleSpy = jest.spyOn(console, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {
      throw new Error("Should not succeed!");
    }, (err: Error) => {
    
      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("[e] An error occurred while processing the file contents. Stack trace:");
      expect(consoleSpy).toHaveBeenCalledWith(err.stack);
      expect(err).toBeTruthy();

      done();
    });
  });
});
