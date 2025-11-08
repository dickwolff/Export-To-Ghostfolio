import { RelaiConverter } from "./relaiConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("relaiConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arrange
    const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/relai-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(3);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/relai-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Transaction Type,BTC Amount,BTC Price,Currency Pair,Fiat Amount (excl. fees),Fiat Currency,Fee,Fee Currency,Destination,Operation ID,Counterparty\n`;

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
      const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += `Date,Transaction Type,BTC Amount,BTC Price,Currency Pair,Fiat Amount (excl. fees),Fiat Currency,Fee,Fee Currency,Destination,Operation ID,Counterparty\n`;
      tempFileContent += `2025-08-04T08:02:44Z,Buy,0.00319120,93144.47,BTC/CHF,297.30,CHF,2.70,CHF,bc1cfe38ee57e,operation123`;

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("Invalid Record Length");

        done();
      });
    });
  });

  it("should process buy and sell transactions correctly", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date,Transaction Type,BTC Amount,BTC Price,Currency Pair,Fiat Amount (excl. fees),Fiat Currency,Fee,Fee Currency,Destination,Operation ID,Counterparty\n`;
    tempFileContent += `2025-08-04T08:02:44Z,Buy,0.00319120,93144.47,BTC/CHF,297.30,CHF,2.70,CHF,bc1cfe38ee57e,operation123,Relai Switzerland\n`;
    tempFileContent += `2025-08-23T22:07:09Z,Sell,0.03463180,90529.66,BTC/CHF,3106.70,CHF,0.00,CHF,CH4841717,39aed08b,Relai Switzerland`;

    const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(2);

      // Check buy transaction
      expect(actualExport.activities[0].type).toBe("BUY");
      expect(actualExport.activities[0].quantity).toBe(0.00319120);
      expect(actualExport.activities[0].unitPrice).toBe(93144.47);
      expect(actualExport.activities[0].fee).toBe(2.70);
      expect(actualExport.activities[0].currency).toBe("CHF");

      // Check sell transaction
      expect(actualExport.activities[1].type).toBe("SELL");
      expect(actualExport.activities[1].quantity).toBe(0.03463180);
      expect(actualExport.activities[1].unitPrice).toBe(90529.66);
      expect(actualExport.activities[1].fee).toBe(0.00);
      expect(actualExport.activities[1].currency).toBe("CHF");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should apply symbol override when configured", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += `Date,Transaction Type,BTC Amount,BTC Price,Currency Pair,Fiat Amount (excl. fees),Fiat Currency,Fee,Fee Currency,Destination,Operation ID,Counterparty\n`;
    tempFileContent += `2024-07-22T09:41:06Z,Buy,0.00284516,95287.63,BTC/CHF,271.05,CHF,2.45,CHF,bc1q2xuea8y8un9xqzrngyy2yn9ulbl0k2ngnmxfff,02731d4a-9b8c-42f7-b6e5-c3a8f1d9e2b4,Relai Switzerland`;

    const securityService = new SecurityService(new YahooFinanceServiceMock());

    // Mock the getSymbolOverride to return GF_BTC-CHF
    jest.spyOn(securityService, "getSymbolOverride").mockReturnValue("GF_BTC-CHF");

    const sut = new RelaiConverter(securityService);

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1);
      expect(actualExport.activities[0].symbol).toBe("GF_BTC-CHF");
      expect(actualExport.activities[0].quantity).toBe(0.00284516);
      expect(actualExport.activities[0].unitPrice).toBe(95287.63);

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
    // Arrange
    const tempFileContent = "Invalid CSV content";
    const sut = new RelaiConverter(new SecurityService(new YahooFinanceServiceMock()));

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

