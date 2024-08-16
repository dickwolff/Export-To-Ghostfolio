import { DeGiroConverterV3 } from "./degiroConverterV3";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("degiroConverterV3", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
    jest.spyOn(console, "error").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/degiro-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(17);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  it("should map GBP to GBp if Yahoo Finance returns GBp for AV.L", (done) => {

    // Arrange
    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    let tempFileContent = "";
    tempFileContent += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
    tempFileContent += `02-04-2024,09:00,02-04-2024,AVIVA,GB00BPQY8M80,Sell 4 AVIVA@496 GBX (GB00BPQY8M80),,GBP,19.84,GBP,114.31,86c1f17b-8a74-4126-af39-61049bcb6e33\n`;

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(1);
      expect(actualExport.activities[0].currency).toBe("GBp");

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/degiro-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new DeGiroConverterV3(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";

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
      const sut = new DeGiroConverterV3(new SecurityService());

      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `15-12-2022,16:55,15-12-2022,VICI PROPERTIES INC. C,US9256521090,DEGIRO Transactiekosten en/of kosten van derden,,EUR,"-1,00",EUR,"31,98",5925d76b-eb36-46e3-b017-a61a6d03c3e7,,\n`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error ocurred while parsing! Details: Invalid Record Length: columns length is 12, got 14 on line 2");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `15-12-2022,16:55,15-12-2022,VICI PROPERTIES INC. C,US9256521090,DEGIRO Transactiekosten en/of kosten van derden,,EUR,"-1,00",EUR,"31,98",5925d76b-eb36-46e3-b017-a61a6d03c3e7\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,VICI PROPERTIES INC. C,US9256521090,"Koop 1 @ 33,9 USD",,USD,"-33,90",USD,"-33,90",5925d76b-eb36-46e3-b017-a61a6d03c3e7`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new DeGiroConverterV3(new SecurityService(yahooFinanceServiceMock));

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
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `15-12-2022,16:55,15-12-2022,VICI PROPERTIES INC. C,US9256521090,DEGIRO Transactiekosten en/of kosten van derden,,EUR,"-1,00",EUR,"31,98",5925d76b-eb36-46e3-b017-a61a6d03c3e7\n`;
    tempFileContent += `15-12-2022,16:55,15-12-2022,VICI PROPERTIES INC. C,US9256521090,"Koop 1 @ 33,9 USD",,USD,"-33,90",USD,"-33,90",5925d76b-eb36-46e3-b017-a61a6d03c3e7`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new DeGiroConverterV3(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for US9256521090 with currency EUR! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
