jest.mock("cli-progress", () => {
  class MultiBar {
    public create() {
      return { increment: jest.fn() };
    }
    public stop() {
      // no-op in tests
    }
    public log() {
      // no-op in tests
    }
  }

  return {
    MultiBar,
    Presets: { shades_classic: {} }
  };
});

import {DeGiroConverterV3} from "./degiroConverterV3";
import {SecurityService} from "../securityService";
import {GhostfolioExport} from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("degiroConverterV3", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
    jest.spyOn(console, "warn").mockImplementation(jest.fn());
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
      expect(actualExport.activities.length).toBe(26);

      done();
    }, (err) => { done(err || new Error("Should not have an error!")); });
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
        expect(err.message).toContain("An error occurred while parsing");

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
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 12, got 14 on line 2");

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
    }, (err) => done(err || new Error("Should not have an error!")));
  });

  it("should process foreign currency", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `03-03-2020,11:14,03-03-2020,ISHARES GLOBAL CLEAN ENERGY UCITS ETF,IE00B1XNHC34,"Koop 475 @ 583,5 GBX",,GBP,-2771.63,GBP,,3b000105-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n`;
    tempFileContent += `02-04-2024,09:00,02-04-2024,AVIVA,GB00BPQY8M80,Sell 4 AVIVA@496 GBX (GB00BPQY8M80),,GBP,19.84,GBP,114.31,86c1f17b-8a74-4126-af39-61049bcb6e33\n`;
    tempFileContent += `27-05-2024,07:41,24-05-2024,TOYOTA MOTOR CORP,JP3633400001,Dividend,,JPY,9999.99,JPY,9999.99,\n`;
    tempFileContent += `27-05-2024,07:41,24-05-2024,TOYOTA MOTOR CORP,JP3633400001,Dividendbelasting,,JPY,-9999.99,JPY,-9999.99,\n`;
    tempFileContent += `08-03-2024,11:25,08-03-2024,TOYOTA MOTOR CORP,JP3633400001,DEGIRO Transactiekosten en/of kosten van derden,,EUR,-9999.99,EUR,9999.99,541651641\n`;
    tempFileContent += `08-03-2024,11:25,08-03-2024,TOYOTA MOTOR CORP,JP3633400001,"Koop 30 @ 22,4 EUR",,EUR,-9999.99,EUR,9999.99,541651641`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(4);

      expect(actualExport.activities[0].currency).toBe("GBP");
      expect(actualExport.activities[1].currency).toBe("GBP");
      expect(actualExport.activities[2].currency).toBe("JPY");
      expect(actualExport.activities[3].currency).toBe("EUR");

      done();
    }, (e) => { console.log(e); done(e || new Error("Should not have an error!")); });
  });

  it("should suppress dividend and all associated rows when original is fully cancelled by a storno", (done) => {

    // Arrange: the file contains both the original dividend pair AND the storno (reversal) pair.
    // The net result is zero — no activity should be produced.
    let tempFileContent = "";
    tempFileContent += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
    // Original: positive dividend + negative tax
    tempFileContent += `24-04-2026,07:34,02-04-2026,APPLE INC,US0378331005,Dywidenda,,USD,"1,39",USD,"1,39",\n`;
    tempFileContent += `24-04-2026,07:34,02-04-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,"-0,21",USD,"1,18",\n`;
    // Storno: negative dividend + positive tax
    tempFileContent += `24-04-2026,07:34,02-04-2026,APPLE INC,US0378331005,Dywidenda,,USD,"-1,39",USD,"-0,21",\n`;
    tempFileContent += `24-04-2026,07:34,02-04-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,"0,21",USD,"0,00",\n`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: no activities because the dividend was fully reversed
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(0);

      done();
    }, (err) => {
      done(err || new Error("Should not have an error!"));
    });
  });

  it("should import dividend normally when only the original rows are present (no storno)", (done) => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
    tempFileContent += `03-04-2026,07:22,02-04-2026,APPLE INC,US0378331005,Dywidenda,,USD,"1,39",USD,"1,39",\n`;
    tempFileContent += `03-04-2026,07:22,02-04-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,"-0,21",USD,"1,18",\n`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: one DIVIDEND activity is produced
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1);
      expect(actualExport.activities[0].type).toBe("DIVIDEND");
      expect(actualExport.activities[0].unitPrice).toBe(1.39);
      expect(actualExport.activities[0].fee).toBe(0.21);

      done();
    }, (err) => {
      done(err || new Error("Should not have an error!"));
    });
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
   
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

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

  describe("Polish language support", () => {

    it("should filter out Polish deposit (depozyt) records", (done) => {
      // Arrange
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `16-02-2026,23:57,16-02-2026,,,Depozyt,,EUR,"684,19",EUR,"884,37",\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",test-order-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        // Assert - should only have the buy transaction, depozyt should be filtered
        expect(actualExport.activities.length).toBe(1);
        expect(actualExport.activities[0].type).toBe("BUY");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should filter out Polish transfer (przelew) records", (done) => {
      // Arrange
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `16-02-2026,23:57,16-02-2026,,,Przelew,,EUR,"-100,00",EUR,"884,37",\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",test-order-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        // Assert
        expect(actualExport.activities.length).toBe(1);
        expect(actualExport.activities[0].type).toBe("BUY");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should import original dividend and skip storno reversal pair", (done) => {
      // Normal dividend pair followed by a storno (reversal) pair for the same security.
      // Expected: only the original dividend activity is imported.
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      // Original dividend (positive Dywidenda + negative tax)
      tempFileContent += `10-03-2024,08:00,10-03-2024,APPLE INC,US0378331005,Dywidenda,,USD,"50,00",USD,"50,00",\n`;
      tempFileContent += `10-03-2024,08:00,10-03-2024,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,"-7,50",USD,"-7,50",\n`;
      // Storno pair (negative Dywidenda + positive tax)
      tempFileContent += `11-03-2024,08:00,11-03-2024,APPLE INC,US0378331005,Dywidenda,,USD,"-50,00",USD,"0,00",\n`;
      tempFileContent += `11-03-2024,08:00,11-03-2024,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,"7,50",USD,"7,50",`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        const dividendActivities = actualExport.activities.filter(a => a.type === "DIVIDEND");
        expect(dividendActivities.length).toBe(1);
        expect(dividendActivities[0].unitPrice).toBeCloseTo(50);
        done();
      }, (err) => {
        done(err || new Error("Should not have an error!"));
      });
    });

    it("should classify Polish transaction fee text as transaction fee", () => {
      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
      const record = {
        description: "DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich",
        orderId: "order-1"
      } as any;

      expect((sut as any).isTransactionFeeRecord(record, true)).toBe(true);
    });
  });

  describe("FX record filtering", () => {

    it("should filter out FX Credit records", (done) => {
      // Arrange (synthetic records)
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `10-01-2024,10:00,10-01-2024,SYNTH FX ASSET,ZZ0000000001,FX Credit,,USD,"100,00",USD,"100,00",order-1\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",order-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        expect(actualExport.activities.length).toBe(1);
        expect(actualExport.activities[0].type).toBe("BUY");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should filter out FX Withdrawal records", (done) => {
      // Arrange (synthetic records)
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `10-01-2024,10:00,10-01-2024,SYNTH FX ASSET,ZZ0000000001,FX Withdrawal,,EUR,"-90,00",EUR,"-90,00",order-1\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",order-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        expect(actualExport.activities.length).toBe(1);
        expect(actualExport.activities[0].type).toBe("BUY");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should filter out Hong Kong Stamp Duty records", (done) => {
      // Arrange (synthetic records)
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `10-01-2024,10:00,10-01-2024,SYNTH FX ASSET,ZZ0000000001,Hong Kong Stamp Duty,,EUR,"-4,03",EUR,"-4,03",order-1\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",order-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        expect(actualExport.activities.length).toBe(1);
        expect(actualExport.activities[0].type).toBe("BUY");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should keep BUY activity when FX and fee rows are present", (done) => {
      // Arrange - deterministic pairing: BUY row first, then fee row with same orderId
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",order-abc\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,DEGIRO Transactiekosten en/of kosten van derden,,USD,"-3,00",USD,"-133,00",order-abc\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,FX Credit,,USD,"150,00",USD,"150,00",\n`;
      tempFileContent += `15-12-2022,16:55,15-12-2022,APPLE INC,US0378331005,FX Withdrawal,,EUR,"-130,00",EUR,"-130,00",`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        const buyActivities = actualExport.activities.filter((a) => a.type === "BUY");
        expect(buyActivities.length).toBeGreaterThan(0);
        expect(buyActivities[0].currency).toBe("USD");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });
  });

  describe("Transaction fee detection", () => {

    it("should detect stamp duty as transaction fee", () => {
      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
      const record = { description: "Stamp Duty", orderId: "order-fee" } as any;
      expect((sut as any).isTransactionFeeRecord(record, true)).toBe(true);
    });


    it("should detect French transaction tax (francuski podatek od transakcji)", () => {
      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
      const record = { description: "Francuski podatek od transakcji", orderId: "order-fr-tax" } as any;
      expect((sut as any).isTransactionFeeRecord(record, true)).toBe(true);
    });
  });

  describe("Complex real-world scenarios", () => {

    it("should handle multiple buy orders for same security", (done) => {
      // Arrange
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `01-01-2024,10:00,01-01-2024,APPLE INC,US0378331005,"Koop 1 @ 150,0 USD",,USD,"-150,00",USD,"-150,00",order-1\n`;
      tempFileContent += `01-02-2024,10:00,01-02-2024,APPLE INC,US0378331005,"Koop 2 @ 160,0 USD",,USD,"-320,00",USD,"-470,00",order-2\n`;
      tempFileContent += `01-03-2024,10:00,01-03-2024,APPLE INC,US0378331005,"Koop 1 @ 170,0 USD",,USD,"-170,00",USD,"-640,00",order-3`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        // Assert
        expect(actualExport.activities.length).toBe(3);
        expect(actualExport.activities.filter(a => a.type === "BUY").length).toBe(3);
        expect(actualExport.activities.every(a => a.symbol === "AAPL")).toBe(true);
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });

    it("should handle buy and sell for same security", (done) => {
      // Arrange
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `01-01-2024,10:00,01-01-2024,APPLE INC,US0378331005,"Koop 4 @ 150,0 USD",,USD,"-600,00",USD,"-600,00",order-1\n`;
      tempFileContent += `01-02-2024,10:00,01-02-2024,APPLE INC,US0378331005,"Verkoop 2 @ 160,0 USD",,USD,"320,00",USD,"-280,00",order-2`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      // Act
      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        // Assert
        expect(actualExport.activities.length).toBe(2);
        const buyActivities = actualExport.activities.filter(a => a.type === "BUY");
        const sellActivities = actualExport.activities.filter(a => a.type === "SELL");
        expect(buyActivities.length).toBe(1);
        expect(sellActivities.length).toBe(1);
        expect(buyActivities[0].quantity).toBe(4);
        expect(sellActivities[0].quantity).toBe(2);
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });
  });

  describe("Partial fill warnings", () => {
    it("should merge partial fills into one activity with total quantity and log a merge notice", (done) => {
      let tempFileContent = "";
      tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
      tempFileContent += `15-06-2024,09:00,15-06-2024,APPLE INC,US0378331005,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,-3.00,EUR,-3.00,order-partial-1\n`;
      tempFileContent += `15-06-2024,09:00,15-06-2024,APPLE INC,US0378331005,"Kupno 300 Apple Inc@150,0 USD",,USD,-45000.00,USD,-45000.00,order-partial-1\n`;
      tempFileContent += `15-06-2024,09:00,15-06-2024,APPLE INC,US0378331005,"Kupno 100 Apple Inc@150,0 USD",,USD,-15000.00,USD,-15000.00,order-partial-1`;

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
      const logSpy = console.log as jest.Mock;

      sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
        // Partial fills must be merged into one BUY activity with total quantity 400.
        const buyActivities = actualExport.activities.filter(a => a.type === "BUY");
        expect(buyActivities.length).toBe(1);
        expect(buyActivities[0].quantity).toBe(400);

        // Log must contain a merge notice for this order.
        const mergeMessage = logSpy.mock.calls
          .map((c) => c[0])
          .find((msg) => typeof msg === "string" && msg.includes("order-partial-1"));
        expect(mergeMessage).toContain("Merged into one activity");
        expect(mergeMessage).toContain("400 shares");
        done();
      }, (err) => { done(err || new Error("Should not have an error!")); });
    });
  });

  describe("quantity parsing with locale thousands separators", () => {

    const cases: { label: string; description: string; expectedQty: number }[] = [
      // No separator
      {
        label: "plain integer",
        description: "Kupno 150 ACME@5,00 HKD",
        expectedQty: 150
      },
      // Space separator (Polish / French)
      {
        label: "space thousands (3-digit)",
        description: "Kupno 1 250 Generic Fund...@3,500 EUR",
        expectedQty: 1250
      },
      {
        label: "space thousands (4-digit)",
        description: "Sprzedaz 2 500 Generic Fund...@4,200 EUR",
        expectedQty: 2500
      },
      {
        label: "space thousands (5-digit)",
        description: "Sprzedaz 10 000 Generic Fund...@1,500 EUR",
        expectedQty: 10000
      },
      {
        label: "NBSP thousands",
        description: "Kupno 1\u00A0250 Generic Fund...@3,500 EUR",
        expectedQty: 1250
      },
      {
        label: "narrow NBSP thousands",
        description: "Kupno 1\u202F250 Generic Fund...@3,500 EUR",
        expectedQty: 1250
      },
      // Dot separator (German / Italian)
      {
        label: "dot thousands",
        description: "Kauf 1.250 Produkt@3,500 EUR",
        expectedQty: 1250
      },
      // Comma separator (English)
      {
        label: "comma thousands",
        description: "Buy 1,250 Product@3.500 EUR",
        expectedQty: 1250
      },
      // Ensure unit price (after @) is NOT matched instead of quantity
      {
        label: "small qty, large price",
        description: "Kupno 45 Generic Fund...@12,345 EUR",
        expectedQty: 45
      },
      {
        label: "price with comma decimal",
        description: "Kupno 100 ACME@1,234 EUR",
        expectedQty: 100
      },
      // Ensure a thousands-separated number embedded in the product name does not shadow the quantity
      {
        label: "qty before name with thousands-sep number",
        description: "Kupno 5 MSCI World 2 000 Index@1,0 USD",
        expectedQty: 5
      },
    ];

    cases.forEach(({ label, description, expectedQty }) => {
      it(`should parse quantity correctly: ${label}`, (done) => {
        // Inline CSV: negative amount → BUY. USD currency matches AAPL (US0378331005) in mock.
        const amountStr = `-${expectedQty}.00`;
        let tempFileContent = "";
        tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
        tempFileContent += `01-01-2024,10:00,01-01-2024,APPLE INC,US0378331005,"${description}",,USD,"${amountStr}",USD,"${amountStr}",order-qty-test`;

        const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

        sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {
          expect(actualExport.activities.length).toBe(1);
          expect(actualExport.activities[0].quantity).toBe(expectedQty);
          done();
        }, (err) => { done(err || new Error("Should not have an error!")); });
      });
    });
  });

  describe("dividend reversal / storno", () => {

    it("should not create a duplicate dividend when DEGIRO re-books a storno+correction on a later booking date", (done) => {
      // DEGIRO re-booking pattern: the original dividend is posted on booking date A (value date V).
      // Later, on booking date B > A (same value date V), DEGIRO posts a four-row correction batch:
      //   −div (reversal), +tax (reversal), −tax (correction), +div (correction).
      // Net economic result: exactly ONE dividend activity from the original batch on date A.
      // Uses US0378331005 (AAPL) which is present in the Yahoo Finance mock.
      const csv = [
        "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id",
        "06-01-2026,07:00,05-01-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,-0.21,USD,-0.21,",
        "06-01-2026,07:00,05-01-2026,APPLE INC,US0378331005,Dywidenda,,USD,1.39,USD,1.39,",
        "26-01-2026,14:06,05-01-2026,APPLE INC,US0378331005,Dywidenda,,USD,-1.39,USD,-1.39,",
        "26-01-2026,14:05,05-01-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,0.21,USD,0.21,",
        "26-01-2026,14:04,05-01-2026,APPLE INC,US0378331005,Podatek Dywidendowy,,USD,-0.21,USD,-0.21,",
        "26-01-2026,14:04,05-01-2026,APPLE INC,US0378331005,Dywidenda,,USD,1.39,USD,1.39,",
      ].join("\n");

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
        const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
        expect(dividends.length).toBe(1);
        expect(dividends[0].unitPrice).toBeCloseTo(1.39, 2);
        expect(dividends[0].fee).toBeCloseTo(0.21, 2);
        done();
      }, (err) => {
        done(err || new Error("Should not have an error!"));
      });
    });

    it("should export fee = 0 for a dividend with no accompanying tax row", (done) => {
      // Some ETF dividends have no withholding tax row in the CSV.
      // A later trade-fee row for the same ISIN must not be picked up as dividend tax.
      // Uses US0378331005 (AAPL) which is present in the Yahoo Finance mock.
      const csv = [
        "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id",
        // Standalone dividend — no tax row
        "26-12-2025,07:39,24-12-2025,APPLE INC,US0378331005,Dywidenda,,USD,1.39,USD,1.39,",
        // Later trade for the same ISIN — must NOT bleed its fee into the dividend above
        "02-01-2026,10:00,02-01-2026,APPLE INC,US0378331005,DEGIRO Transactiekosten en/of kosten van derden,,USD,-3.00,USD,-3.00,order-later",
        "02-01-2026,10:00,02-01-2026,APPLE INC,US0378331005,\"Koop 1 @ 150,0 USD\",,USD,-150.00,USD,-150.00,order-later",
      ].join("\n");

      const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

      sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
        const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
        expect(dividends.length).toBe(1);
        expect(dividends[0].fee).toBe(0);
        done();
      }, (err) => {
        done(err || new Error("Should not have an error!"));
      });
    });
  });
});
