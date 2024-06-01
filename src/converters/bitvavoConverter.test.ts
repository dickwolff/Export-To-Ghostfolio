import { BitvavoConverter } from "./bitvavoConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("bitvavoConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new BitvavoConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new BitvavoConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/bitvavo-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(21);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new BitvavoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/bitvavo-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new BitvavoConverter(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "Timezone,Date,Time,Type,Currency,Amount,Price (EUR),EUR received / paid,Fee currency,Fee amount,Status,Transaction ID,Address\n";

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
      const sut = new BitvavoConverter(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "Timezone,Date,Time,Type,Currency,Amount,Price (EUR),EUR received / paid,Fee currency,Fee amount,Status,Transaction ID,Address\n";
      tempFileContent += "Europe/Amsterdam,2023-01-09,17:19:11,withdrawal,USDT,-32.156874000000003,,,USDT,5.4,Completed,1d0165bb-065f-4f0d-ba44-fb137534e010,0xaeC107aC155cA21A896888fe486de410c422424a,,"

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error ocurred while parsing! Details: Invalid Record Length: columns length is 13, got 15 on line 2");

        done();
      });
    });
  });
});
