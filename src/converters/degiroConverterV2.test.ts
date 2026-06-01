import { DeGiroConverterV2 } from "./degiroConverterV2";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("degiroConverterV2", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
    jest.spyOn(console, "warn").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new DeGiroConverterV2(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new DeGiroConverterV2(new SecurityService(new YahooFinanceServiceMock()));
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
      const sut = new DeGiroConverterV2(new SecurityService(new YahooFinanceServiceMock()));

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
      const sut = new DeGiroConverterV2(new SecurityService());

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
      const sut = new DeGiroConverterV2(new SecurityService());

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
      const sut = new DeGiroConverterV2(new SecurityService(yahooFinanceServiceMock));

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
    const sut = new DeGiroConverterV2(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for US9256521090 with currency EUR! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  describe("Spanish keyword classification", () => {

    const record = (description: string, orderId = "") => ({
      date: "01-01-2024",
      time: "12:00",
      currencyDate: "01-01-2024",
      product: "TEST",
      isin: "TEST",
      description,
      fx: "",
      currency: "EUR",
      amount: "1,00",
      col1: "",
      col2: "",
      orderId
    }) as any;

    const newSut = () =>
      new DeGiroConverterV2(new SecurityService(new YahooFinanceServiceMock())) as any;

    // Each row: [classifier method name, description, args after the record, expected].
    // Lowercase + uppercase variants per keyword lock in lowercase normalization.
    it.each([
      ["isIgnoredRecord", "Conversión fondos del mercado monetario: Compra 0,002521 @ 9.915,9121 EUR", [], true],
      ["isIgnoredRecord", "CONVERSIÓN FONDOS DEL MERCADO MONETARIO: Venta 0,001063 @ 9.912,2063 EUR", [], true],
      ["isPlatformFees", "Comisión de conectividad con el mercado 2024 (New York Stock Exchange - NSY)", [], true],
      ["isPlatformFees", "COMISIÓN DE CONECTIVIDAD con el mercado 2025 (Xetra - XET)", [], true],
      ["isTransactionFeeRecord", "Costes de transacción y/o externos de DEGIRO", [true], true],
      ["isTransactionFeeRecord", "COSTES DE TRANSACCIÓN Y/O EXTERNOS DE DEGIRO", [true], true],
      ["isTransactionFeeRecord", "Retención del dividendo", [false], true],
      ["isTransactionFeeRecord", "RETENCIÓN DEL DIVIDENDO", [false], true],
      ["isDividendRecord", "Rendimiento de capital", [], true],
      ["isDividendRecord", "RENDIMIENTO DE CAPITAL", [], true],

      // Negative cases: real-trade and unrelated phrases must not be misclassified.
      ["isIgnoredRecord", "Compra 1 Telefonica SA@3,937 EUR (ES0178430E18)", [], false],
      ["isIgnoredRecord", "Dividendo", [], false],
      ["isPlatformFees", "Costes de transacción y/o externos de DEGIRO", [], false],
      ["isPlatformFees", "compra 1 alphabet inc class a@164,16 usd", [], false],
      ["isDividendRecord", "Costes de transacción y/o externos de DEGIRO", [], false],
      ["isDividendRecord", "COMPRA 1 Telefonica SA@3,937 EUR", [], false],
      ["isTransactionFeeRecord", "Dividendo", [false], false],
      ["isTransactionFeeRecord", "Compra 1 Telefonica SA@3,937 EUR", [true], false],
    ] as const)("%s(%s) === %s", (method, description, extraArgs, expected) => {

      const sut = newSut();
      const result = sut[method](record(description), ...extraArgs);
      expect(result).toBe(expected);
    });

    // Dividend-context orderId guard: a real fee phrase still returns false when
    // paired with a non-empty orderId (V2 line 442 early-return).
    it("isTransactionFeeRecord returns false for a dividend fee with non-empty orderId", () => {

      const sut = newSut();
      const result = sut.isTransactionFeeRecord(record("Retención del dividendo", "abc-123"), false);
      expect(result).toBe(false);
    });
  });

  it("should log error and invoke errorCallback when an error occurs in processFileContents", (done) => {
  
    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new DeGiroConverterV2(new SecurityService(new YahooFinanceServiceMock()));

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
