import { VanguardUkConverter } from "./vanguardUkConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

const header = "Date,Details,Amount,Balance,,\n";

// The recorded Yahoo Finance test data has no Vanguard UK funds, so resolve every query to an LSE listing.
function createYahooFinanceServiceMock(): YahooFinanceServiceMock {
  const yahooFinanceServiceMock = new YahooFinanceServiceMock();

  jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation((query: string) => {
    return Promise.resolve({ quotes: [{ symbol: `${query}.L`, longname: query }] });
  });
  jest.spyOn(yahooFinanceServiceMock, "quoteSummary").mockImplementation((symbol: string) => {
    return Promise.resolve({ price: { currency: "GBP", exchange: "LSE", symbol: symbol, regularMarketPrice: 100 } });
  });

  return yahooFinanceServiceMock;
}

describe("vanguardUkConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should process sample CSV file", (done) => {

    // Arrange
    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));
    const inputFile = "samples/vanguard-uk-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport.activities.length).toBe(6);

      done();
    }, (err: any) => { done(err); });
  });

  it("should add the dealing fee to the trade and look up a missing ticker in the investment transactions", (done) => {

    // Arrange
    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));

    // Act
    sut.readAndProcessFile("samples/vanguard-uk-export.csv", (actualExport: GhostfolioExport) => {

      // Assert
      const buy = actualExport.activities[0];
      expect(buy.type).toBe("BUY");
      expect(buy.symbol).toBe("VHYL.L");
      expect(buy.quantity).toBe(1630);
      expect(buy.unitPrice).toBeCloseTo(42.9185, 4);
      expect(buy.fee).toBe(7.5);
      expect(buy.date).toContain("2017-10-26");

      done();
    }, (err: any) => { done(err); });
  });

  it("should derive the dividend quantity from the payout", (done) => {

    // Arrange
    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));

    // Act
    sut.readAndProcessFile("samples/vanguard-uk-export.csv", (actualExport: GhostfolioExport) => {

      // Assert
      const dividend = actualExport.activities.find(activity => activity.type === "DIVIDEND");
      expect(dividend.symbol).toBe("VHYL.L");
      expect(dividend.quantity).toBe(1630);
      expect(dividend.unitPrice).toBeCloseTo(0.24627179, 8);

      done();
    }, (err: any) => { done(err); });
  });

  it("should add interest and account fees as manual activities", (done) => {

    // Arrange
    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));

    // Act
    sut.readAndProcessFile("samples/vanguard-uk-export.csv", (actualExport: GhostfolioExport) => {

      // Assert
      const interest = actualExport.activities.find(activity => activity.type === "INTEREST");
      expect(interest.dataSource).toBe("MANUAL");
      expect(interest.unitPrice).toBe(0.03);

      const fee = actualExport.activities.find(activity => activity.type === "FEE");
      expect(fee.dataSource).toBe("MANUAL");
      expect(fee.fee).toBe(24.02);
      expect(fee.unitPrice).toBe(0);

      const manualSymbols = [interest.symbol, fee.symbol];
      expect(actualExport.assetProfiles.map(profile => profile.symbol).sort()).toEqual(manualSymbols.sort());

      done();
    }, (err: any) => { done(err); });
  });

  it("should add the closing balance of each day to the account", (done) => {

    // Arrange
    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));

    // Act
    sut.readAndProcessFile("samples/vanguard-uk-export.csv", (actualExport: GhostfolioExport) => {

      // Assert
      const balances = actualExport.accounts[0].balances;
      expect(balances.length).toBe(8);
      expect(balances[0]).toEqual({ date: "2017-10-25T00:00:00.000Z", value: 70100 });
      expect(balances[balances.length - 1]).toEqual({ date: "2025-04-22T00:00:00.000Z", value: 13616.68 });

      done();
    }, (err: any) => { done(err); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new VanguardUkConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/vanguard-uk-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err.message).toContain("does not exist");

        done();
      });
    });

    it("the input file has no cash transactions header", (done) => {

      // Arrange
      const sut = new VanguardUkConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents("", () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err.message).toContain("Cash transactions header not found");

        done();
      });
    });

    it("the input file has no cash transactions", (done) => {

      // Arrange
      const sut = new VanguardUkConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(header, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err.message).toContain("An error occurred while parsing");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = header;
      tempFileContent += `08/01/2018,DIV: VHYL.XLON.GB @ GBP 0.24627179,401.42,536.74,,`;

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new VanguardUkConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, () => { done("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err.message).toContain("Unit test error");

        done();
      });
    });
  });

  it("should add a dealing fee that is listed before its trade to that trade", (done) => {

    // Arrange
    let tempFileContent = header;
    tempFileContent += `22/04/2025,ETF dealing fee (buy) S&P 500 UCITS ETF - Accumulating (VUAG),-7.50,"13,616.68",,\n`;
    tempFileContent += `22/04/2025,Bought 133 S&P 500 UCITS ETF - Accumulating (VUAG),"-9,938.80","13,624.18",,`;

    const sut = new VanguardUkConverter(new SecurityService(createYahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport.activities.length).toBe(1);
      expect(actualExport.activities[0].type).toBe("BUY");
      expect(actualExport.activities[0].fee).toBe(7.5);

      done();
    }, () => done("Should not have an error!"));
  });

  it("should log and skip the trade and its dealing fee when Yahoo Finance returns no symbol", (done) => {

    // Arrange
    let tempFileContent = header;
    tempFileContent += `22/04/2025,Bought 133 S&P 500 UCITS ETF - Accumulating (VUAG),"-9,938.80","13,624.18",,\n`;
    tempFileContent += `22/04/2025,ETF dealing fee (buy) S&P 500 UCITS ETF - Accumulating (VUAG),-7.50,"13,616.68",,`;

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new VanguardUkConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for VUAG with currency GBP! Please add this manually..\n");
      expect(actualExport.activities.length).toBe(0);

      done();
    }, () => done("Should not have an error!"));
  });

  it("should log and skip unknown cash transactions", (done) => {

    // Arrange
    let tempFileContent = header;
    tempFileContent += `22/04/2025,Something unexpected,-1.00,10.00,,`;

    const sut = new VanguardUkConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("[i] Unknown cash transaction 'Something unexpected' on 22/04/2025, skipping..\n");
      expect(actualExport.activities.length).toBe(0);

      done();
    }, () => done("Should not have an error!"));
  });
});
