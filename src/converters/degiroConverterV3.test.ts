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

  it("should prefix MANUAL platform fee symbols with GF_ (Ghostfolio validation requires UUID or GF_ prefix)", (done) => {

    // Arrange
    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/degiro-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      const manualActivities = actualExport.activities.filter(a => a.dataSource === "MANUAL");
      expect(manualActivities.length).toBeGreaterThan(0);
      for (const activity of manualActivities) {
        expect(activity.symbol.startsWith("GF_")).toBe(true);
      }

      done();
    }, (err) => { done(err); });
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

  it("should convert an Achat (buy) grouped with FX Crédit/Débit rows into a BUY activity", (done) => {

    // Arrange: DeGiro FR export uses "Operation de change - Crédit" (no accent on 'Operation')
    // and "Opération de change - Débit" (with accent). All rows share the same orderId as
    // the Achat. If the unaccented FX Crédit row is not ignored, the converter pairs it as
    // a dividend and the Achat is dropped entirely.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Operation de change - Crédit,"1,0824",USD,"570,00",USD,"0,00",00000000-0000-4000-8000-000000000001\n`;
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Opération de change - Débit,,EUR,"-526,61",EUR,"43,76",00000000-0000-4000-8000-000000000001\n`;
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-1,00",EUR,"570,37",00000000-0000-4000-8000-000000000001\n`;
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Achat 3 NVIDIA Corporation@190 USD (US67066G1040),,USD,"-570,00",USD,"-570,00",00000000-0000-4000-8000-000000000001`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(buys.length).toBe(1);
      expect(buys[0].quantity).toBe(3);
      expect(buys[0].unitPrice).toBe(190);
      expect(buys[0].currency).toBe("USD");
      expect(buys[0].symbol).toBe("NVDA");

      // And no spurious dividend from the FX rows.
      const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
      expect(dividends.length).toBe(0);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should pair fee row with Achat row on the same day (findMatchByOrderId date parsing)", (done) => {

    // Arrange: Exact real-world CSV shape from a DeGiro FR export. The Achat row comes
    // AFTER the fee row (matches the order DeGiro emits). findMatchByOrderId must find
    // the Achat when iterating from the fee row. It uses dayjs(r.date) which is
    // 'DD-MM-YYYY' — must be parsed with an explicit format or the isSame check fails.
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-1,00",EUR,"570,37",00000000-0000-4000-8000-000000000001\n`;
    tempFileContent += `31-01-2023,16:00,31-01-2023,NVIDIA CORPORATION,US67066G1040,Achat 3 NVIDIA Corporation@190 USD (US67066G1040),,USD,"-570,00",USD,"-570,00",00000000-0000-4000-8000-000000000001`;

    const sut = new DeGiroConverterV3(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: exactly one BUY (the fee attachment is verified in a separate case).
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(buys.length).toBe(1);
      expect(buys[0].quantity).toBe(3);
      expect(buys[0].unitPrice).toBe(190);
      expect(buys[0].symbol).toBe("NVDA");

      const dividends = actualExport.activities.filter(a => a.type === "DIVIDEND");
      expect(dividends.length).toBe(0);

      done();
    }, (e) => { console.log(e); done(new Error("Should not have an error!")); });
  });

  it("should not let EUR fee row poison the security lookup for a USD BUY (ELF Beauty case)", (done) => {

    // Arrange: Real-world CSV shape. Fee row is in EUR, Achat is in USD.
    // Yahoo returns a single quote for the ISIN. If we pass EUR (from the fee row)
    // as the expected currency, we may match a wrong exchange-suffixed variant.
    // The security lookup for a buy/sell record set must use the buy/sell row's
    // currency (USD), not the fee row's currency (EUR).
    let tempFileContent = "";
    tempFileContent += "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n";
    tempFileContent += `21-02-2024,15:30,21-02-2024,"E.L.F. BEAUTY, INC.",US26856L1035,Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-2,00",EUR,"1988,52",00000000-0000-4000-8000-000000000002\n`;
    tempFileContent += `21-02-2024,15:30,21-02-2024,"E.L.F. BEAUTY, INC.",US26856L1035,"Achat 12 e.l.f. Beauty, Inc.@170,14 USD (US26856L1035)",,USD,"-2041,68",USD,"174,19",00000000-0000-4000-8000-000000000002`;

    const yahooMock = new YahooFinanceServiceMock();
    // Yahoo returns two quotes for the ISIN:
    //   - EUR/Xetra 'ELFA.DE' (Deka ETF, wrong)
    //   - USD/NYSE 'ELF' (correct)
    // Before the fix, the fee row (EUR) is processed first and picks ELFA.DE via
    // currency match, poisoning the cache. The USD Achat then inherits ELFA.DE.
    // After the fix, the security lookup for a buy/sell record set uses the buy/sell
    // row's currency (USD), so 'ELF' is selected.
    (yahooMock as any).search = async () => ({ quotes: [
      { symbol: "ELFA.DE", longname: "Deka EURO STOXX 50 ESG Filtered UCITS ETF" },
      { symbol: "ELF", longname: "e.l.f. Beauty, Inc." }
    ] });
    (yahooMock as any).quoteSummary = async (sym: string) => {
      if (sym === "ELFA.DE") return { price: { symbol: "ELFA.DE", currency: "EUR", exchange: "GER", regularMarketPrice: 20 } };
      return { price: { symbol: "ELF", currency: "USD", exchange: "NYQ", regularMarketPrice: 170 } };
    };

    const sut = new DeGiroConverterV3(new SecurityService(yahooMock));

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert: BUY must adopt the USD/NYSE symbol, not the EUR/Xetra one.
      const buys = actualExport.activities.filter(a => a.type === "BUY");
      expect(buys.length).toBe(1);
      expect(buys[0].currency).toBe("USD");
      expect(buys[0].symbol).toBe("ELF");
      expect(buys[0].symbol).not.toBe("ELFA.DE");

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
