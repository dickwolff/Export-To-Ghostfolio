import { DeGiroConverterV3 } from "./degiroConverterV3";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
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
      expect(actualExport.activities.length).toBe(27);

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
    }, () => done.fail("Should not have an error!"));
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
    }, (e) => { console.log(e); done.fail("Should not have an error!"); });
  });

  it("should convert an 'Ajustement fractionnement' (stock split) pair into SELL old + BUY new", (done) => {

    // Arrange: DeGiro FR emits stock splits as two 'Ajustement fractionnement' rows sharing
    // no orderId, both on the same date/product/ISIN. Example: NVIDIA 10-for-1 on 2024-06-10.
    //   - Debit  : 'Ajustement fractionnement: 30 NVIDIA @ 120,888 USD'   amount = -3626,64 USD
    //   - Credit : 'Ajustement fractionnement: 3 NVIDIA @ 1 208,88 USD'   amount = +3626,64 USD
    // Before the fix, the credit row is picked up as a DIVIDEND with unitPrice=3626.64,
    // and the debit row is silently dropped. Result: user's share count stays at 3
    // (the original BUY) instead of jumping to 30 post-split.
    //
    // Ghostfolio has no split activity type; the correct representation is a cash-neutral
    // pair: SELL 3 @ 1208.88 (close pre-split position) + BUY 30 @ 120.888 (open post-split).
    // Cost basis preserved, share count correct.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `10-06-2024,10:52,10-06-2024,NVIDIA CORPORATION,US67066G1040,"Ajustement fractionnement: 30 NVIDIA Corporation @ 120,888 USD (US67066G1040)",,USD,"-3626,64",USD,"0,00",\n`;
    tempFileContent += `10-06-2024,10:52,10-06-2024,NVIDIA CORPORATION,US67066G1040,"Ajustement fractionnement: 3 NVIDIA Corporation @ 1 208,88 USD (US67066G1040)",,USD,"3626,64",USD,"3626,64",`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: no DIVIDEND should be emitted from a split.
      const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
      expect(dividends.length).toBe(0);

      // Assert: one SELL of the pre-split shares, one BUY of the post-split shares.
      const sells = actualExport.activities.filter(a => a.type === "SELL");
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(sells.length).toBe(1);
      expect(buys.length).toBe(1);

      expect(sells[0].quantity).toBe(3);
      expect(sells[0].unitPrice).toBeCloseTo(1208.88, 2);
      expect(sells[0].currency).toBe("USD");
      expect(sells[0].symbol).toBe("NVDA");

      expect(buys[0].quantity).toBe(30);
      expect(buys[0].unitPrice).toBeCloseTo(120.888, 3);
      expect(buys[0].currency).toBe("USD");
      expect(buys[0].symbol).toBe("NVDA");

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should handle acquisition/merger cash-neutral (Fusion: Achat @ 0) as BUY not SELL — TopBuild/QXO case", (done) => {

    // Arrange: when a company is acquired, DeGiro FR emits a 'Fusion: Achat' row for the
    // acquirer with amount=0 (the shares are received in exchange, no cash moves).
    // The record has no orderId. The classifier used a strict `totalAmount < 0` check
    // to decide BUY vs SELL, so amount=0 defaulted to SELL — turning a 71-share BUY of
    // the acquirer (QXO) into a phantom SELL 71 and inverting the portfolio position.
    //
    // Expected: 'Fusion: Achat N ...' → BUY N of the acquirer at unitPrice 0.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `08-07-2026,13:13,07-07-2026,QXO INC,US82846H4056,Fusion: Achat 71 QXO Inc@0 USD (US82846H4056),,USD,"0,00",USD,"1223,42",`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    jest.spyOn((sut as any).securityService, "getSecurity").mockImplementation((isin: string) => Promise.resolve({ symbol: isin === "US82846H4056" ? "QXO" : "BLD", currency: "USD" } as any));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: one BUY, zero SELL, quantity 71 (unit price 0 is OK for a cash-neutral merger BUY).
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      const sells = actualExport.activities.filter(a => a.type === "SELL");
      expect(sells.length).toBe(0);
      expect(buys.length).toBe(1);
      expect(buys[0].quantity).toBe(71);
      expect(buys[0].unitPrice).toBe(0);

      done();
    }, (e) => { console.error("ERR>", e && (e as any).stack || e); done(new Error("Should not have an error!")); });
  });

  it("should emit a SELL for 'Rachat: Vente' (buyback/redemption) rows — TopBuild redemption case", (done) => {

    // Arrange: the target-side of a merger emits 'Rachat: Vente N X@price' with a POSITIVE
    // amount (cash received for the redeemed shares). This must yield SELL N of the target.
    // Bug: the row was silently paired with an accompanying tax-refund row on the same date
    // and both were dropped, leaving the phantom acquirer SELL as the only merger-related row.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `08-07-2026,13:02,07-07-2026,TOPBUILD CORP - NON TRADEABLE,US89055F1030,"Rachat: Vente 7 TopBuild Corp - Non tradeable@249,6779 USD (US89055F1030)",,USD,"1747,75",USD,"1747,74",\n`;
    tempFileContent += `08-07-2026,13:02,07-07-2026,TOPBUILD CORP - NON TRADEABLE,US89055F1030,Impôts sur dividende,,USD,"-524,32",USD,"1223,42",`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    jest.spyOn((sut as any).securityService, "getSecurity").mockImplementation(() => Promise.resolve({ symbol: "BLD", currency: "USD" } as any));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: exactly one SELL of 7 shares must survive (tax reversal row is unrelated fee/dividend).
      const sells = actualExport.activities.filter(a => a.type === "SELL");
      expect(sells.length).toBe(1);
      expect(sells[0].quantity).toBe(7);
      expect(sells[0].unitPrice).toBeCloseTo(249.679, 3);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should split a shared broker fee proportionally across partial-fill BUYs (KRYS case)", (done) => {

    // Arrange: partial fill under one orderId at the same time — two BUY rows (1+7 shares)
    // and one €2 fee row. The fee must be split proportionally (7/8 and 1/8) so no fee is lost.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `12-05-2026,21:38,12-05-2026,"KRYSTAL BIOTECH, INC.",US5011471027,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-2,00",EUR,"4020,15",TEST-KRYS-1\n`;
    tempFileContent += `12-05-2026,21:38,12-05-2026,"KRYSTAL BIOTECH, INC.",US5011471027,"Achat 1 Krystal Biotech, Inc.@310 USD (US5011471027)",,USD,"-310,00",USD,"-2480,00",TEST-KRYS-1\n`;
    tempFileContent += `12-05-2026,21:38,12-05-2026,"KRYSTAL BIOTECH, INC.",US5011471027,"Achat 7 Krystal Biotech, Inc.@310 USD (US5011471027)",,USD,"-2170,00",USD,"-2170,00",TEST-KRYS-1`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    jest.spyOn((sut as any).securityService, "getSecurity").mockImplementation(() => Promise.resolve({ symbol: "KRYS", currency: "USD" } as any));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: both BUYs emitted, fee split proportionally, total fee sums to €2.
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(buys.length).toBe(2);
      const totalFee = buys.reduce((s, a) => s + (a.fee || 0), 0);
      expect(totalFee).toBeCloseTo(2, 2);
      // Neither BUY may have a zero fee (both must carry their share).
      expect(buys.every(a => (a.fee || 0) > 0)).toBe(true);
      // Proportional: 7-share BUY carries 7/8 = 1.75, 1-share BUY carries 1/8 = 0.25.
      const buy7 = buys.find(a => a.quantity === 7);
      const buy1 = buys.find(a => a.quantity === 1);
      expect(buy7.fee).toBeCloseTo(1.75, 2);
      expect(buy1.fee).toBeCloseTo(0.25, 2);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should attach broker fee to a same-orderId BUY even when times differ (CART case)", (done) => {

    // Arrange: DeGiro sometimes emits a second fill under the same orderId a few minutes later.
    // Fee row at 18:40 must still attach to the 18:50 BUY (same orderId), not be orphaned.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `06-11-2024,18:50,06-11-2024,MAPLEBEAR INC.,US5653941030,"Achat 45 Maplebear Inc.@47,5 USD (US5653941030)",,USD,"-2137,50",USD,"-2137,50",TEST-CART-1\n`;
    tempFileContent += `06-11-2024,18:40,06-11-2024,MAPLEBEAR INC.,US5653941030,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-2,00",EUR,"2088,22",TEST-CART-1\n`;
    tempFileContent += `06-11-2024,18:40,06-11-2024,MAPLEBEAR INC.,US5653941030,"Achat 2 Maplebear Inc.@47,5 USD (US5653941030)",,USD,"-95,00",USD,"-95,00",TEST-CART-1`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    jest.spyOn((sut as any).securityService, "getSecurity").mockImplementation(() => Promise.resolve({ symbol: "CART", currency: "USD" } as any));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: both BUYs emitted, the €2 fee is split proportionally 45/47 + 2/47 across them.
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(buys.length).toBe(2);
      const totalFee = buys.reduce((s, a) => s + (a.fee || 0), 0);
      expect(totalFee).toBeCloseTo(2, 2);
      expect(buys.every(a => (a.fee || 0) > 0)).toBe(true);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should emit a standalone FEE activity for manual FX broker fees (EUR/USD case)", (done) => {

    // Arrange: DeGiro emits '-10,00 EUR' broker fees on manual FX conversions with product=EUR/USD
    // and a placeholder ISIN 'EURUSD......'. There is no real security, so pairing fails and the row
    // was silently dropped. It must be emitted as a standalone FEE activity so the fee is visible.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `11-04-2024,21:55,11-04-2024,EUR/USD,EURUSD......,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-10,00",EUR,"-4,48",`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: exactly one FEE of €10, no BUYs/SELLs.
      const fees = actualExport.activities.filter(a => a.type === "FEE");
      expect(fees.length).toBe(1);
      expect(fees[0].fee).toBeCloseTo(10, 2);
      expect(fees[0].currency).toBe("EUR");
      expect(actualExport.activities.filter(a => a.type === "BUY" || a.type === "SELL").length).toBe(0);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should treat 'Changement ISIN' (ticker migration) as a cash-neutral SELL old + BUY new, not a phantom dividend (Atlassian case)", (done) => {

    // Arrange: DeGiro emits an ISIN migration as two rows with orderId="": a Vente on the old
    // ISIN and an Achat on the new ISIN, both at the same amount (cash-neutral). Without the
    // corporate-action guard, the Vente row falls through to findMatchByIsin and pairs with an
    // unrelated older BUY that happens to share the same ISIN, producing a phantom DIVIDEND.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    // DeGiro exports newest-first: migration day rows come BEFORE the older real BUY in file order.
    tempFileContent += `03-10-2022,13:57,03-10-2022,ATLASSIAN CORP CLASS A,US0494681010,"Changement ISIN: Achat 2 Atlassian Corp Class A@210,59 USD (US0494681010)",,USD,"-421,18",USD,"0,00",\n`;
    tempFileContent += `03-10-2022,13:57,03-10-2022,ATLASSIAN CORPORATION PLC,GB00BZ09BD16,"Changement ISIN: Vente 2 Atlassian Corporation PLC@210,59 USD (GB00BZ09BD16)",,USD,"421,18",USD,"421,18",\n`;
    // Older real BUY on the old ISIN, months earlier, with its own orderId.
    tempFileContent += `29-04-2022,17:06,29-04-2022,ATLASSIAN CORPORATION PLC,GB00BZ09BD16,"Achat 2 Atlassian Corporation PLC@240,65 USD (GB00BZ09BD16)",,USD,"-481,30",USD,"-481,30",TEST-TEAM-1`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    jest.spyOn((sut as any).securityService, "getSecurity").mockImplementation(() => Promise.resolve({ symbol: "TEAM", currency: "USD" } as any));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: no phantom dividend; SELL 2 old + BUY 2 new for the migration; original 29-04 BUY intact.
      const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
      expect(dividends.length).toBe(0);

      const sells = actualExport.activities.filter(a => a.type === "SELL");
      expect(sells.length).toBe(1);
      expect(sells[0].quantity).toBe(2);
      expect(sells[0].unitPrice).toBeCloseTo(210.59, 2);

      const buys = actualExport.activities.filter(a => a.type === "BUY");
      // Two BUYs: the original 29-04 real trade, and the cash-neutral migration BUY at 210,59.
      expect(buys.length).toBe(2);
      const migrationBuy = buys.find(a => a.date.startsWith("2022-10-03"));
      expect(migrationBuy).toBeTruthy();
      expect(migrationBuy.quantity).toBe(2);
      expect(migrationBuy.unitPrice).toBeCloseTo(210.59, 2);
      const originalBuy = buys.find(a => a.date.startsWith("2022-04-29"));
      expect(originalBuy).toBeTruthy();
      expect(originalBuy.quantity).toBe(2);
      expect(originalBuy.unitPrice).toBeCloseTo(240.65, 2);
      expect(originalBuy.fee).toBeCloseTo(0, 2); // no fee row in this fixture

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
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
});
