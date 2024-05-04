import { EtoroConverter } from "./etoroConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";

describe("etoroConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new EtoroConverter(new SecurityService());

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new EtoroConverter(new SecurityService());
    const inputFile = "samples/etoro-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(18);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new EtoroConverter(new SecurityService());

      let tempFileName = "tmp/testinput/etoro-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new EtoroConverter(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA\n";

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
      tempFileContent += "Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA\n";
      tempFileContent += `02/01/2024 00:10:33,Dividend,NKE/USD,0.17,-,0.17,"4,581.91",99.60,2272508626,Stocks,0.00`;

      // Mock Yahoo Finance service to throw error.
      const securityService = new SecurityService();
      jest.spyOn(securityService, "getSecurity").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new EtoroConverter(securityService);

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
    tempFileContent += "Date,Type,Details,Amount,Units,Realized Equity Change,Realized Equity,Balance,Position ID,Asset type,NWA\n";
    tempFileContent += `02/01/2024 00:10:33,Dividend,NKE/USD,0.17,-,0.17,"4,581.91",99.60,2272508626,Stocks,0.00`;

    // Mock Yahoo Finance service to return null.
    const securityService = new SecurityService();
    jest.spyOn(securityService, "getSecurity").mockImplementation(() => { return null });
    const sut = new EtoroConverter(securityService);

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for dividend action for NKE/USD! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
