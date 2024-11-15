import { DeltaConverter } from "./deltaConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("deltaConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new DeltaConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new DeltaConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/delta-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(2);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new DeltaConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/delta-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new DeltaConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes\n`;

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
      const sut = new DeltaConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes\n`;
      tempFileContent += `2023-05-08 15:00:00-04:00,BUY,5,TSLA,STOCK,1250,USD,Nasdaq,,,,,eToro,Example of a stock purchase,,`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error ocurred while parsing! Details: Invalid Record Length: columns length is 14, got 16 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += `Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes\n`;
      tempFileContent += `2023-05-08 15:00:00-04:00,BUY,5,TSLA,STOCK,1250,USD,Nasdaq,,,,,eToro,Example of a stock purchase`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new DeltaConverter(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += `Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes\n`;
    tempFileContent += `2023-05-08 15:00:00-04:00,BUY,5,TSLA,STOCK,1250,USD,Nasdaq,,,,,eToro,Example of a stock purchase`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new DeltaConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for TSLA with currency USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
