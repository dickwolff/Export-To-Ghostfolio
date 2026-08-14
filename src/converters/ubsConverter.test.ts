import { UbsConverter } from "./ubsConverter";
import { GhostfolioExport } from "../models/ghostfolioExport";
import { SecurityService } from "../securityService";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

const UBS_HEADER = "Bewertungsdatum;Bankbeziehung;Portfolio;Produkt;Abschluss;Abschlusszeit;Buchung;Valuta;Beschreibung 1;Beschreibung 2;Beschreibung 3;Valor;ISIN;Whrg.;Anzahl/Betrag;Whrg.;Trans.-Preis;Devisenkurs;Bewertungswährung;Trans.-Wert;Marchzinsen;Real. Erfolg in %;Real. Erfolg;Auftrags-Nr.;Externe Referenz;Anlageklasse;Sub-Anlageklasse;Instrumentenkategorie";

describe("ubsConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new UbsConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arrange
    const sut = new UbsConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/ubs-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();

      // The sample contains 3 regular buys, a Storno triplet (nets to 1 buy),
      // 1 sell, 1 ignored cash record and the report footer.
      expect(actualExport.activities.length).toBe(5);
      expect(actualExport.activities.filter(a => a.type.toString() === "BUY").length).toBe(4);
      expect(actualExport.activities.filter(a => a.type.toString() === "SELL").length).toBe(1);

      // The re-booked record of the Storno triplet should survive.
      const rebooked = actualExport.activities.filter(a => a.unitPrice === 200.104);
      expect(rebooked.length).toBe(1);
      expect(actualExport.activities.filter(a => a.unitPrice === 200.10).length).toBe(0);

      // Swiss thousands separator (') should be parsed.
      expect(actualExport.activities.filter(a => a.unitPrice === 2410.55).length).toBe(1);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new UbsConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/ubs-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new UbsConverter(new SecurityService(new YahooFinanceServiceMock()));

      // Create temp file.
      let tempFileContent = "";
      tempFileContent += UBS_HEADER + "\n";

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error occurred while parsing");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "";
      tempFileContent += UBS_HEADER + "\n";
      tempFileContent += "14.08.2026;0210 00012345;0210 00012345 R800;0210 00012345.S3;26.01.2026;;28.01.2026;28.01.2026;Kauf aus Emission;CSIF (CH) Equity Sample -P-;;1895681;CH0189956813;;0.415;CHF;2410.55;;CHF;1000;;;;;R5P026AA10000001;Aktien;Stammaktien;Anlagefonds";

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new UbsConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("Unit test error");

        done();
      });
    });
  });

  it("should skip a cash record", (done) => {

    // Arrange
    const sut = new UbsConverter(new SecurityService(new YahooFinanceServiceMock()));

    let tempFileContent = "";
    tempFileContent += UBS_HEADER + "\n";
    tempFileContent += "14.08.2026;0210 00012345;0210 00012345 R800;0210 00012345.S3;25.04.2026;;25.04.2026;25.04.2026;Einzahlung;;;;;;500;CHF;0.000;1.0000;CHF;500;;;;;R5P115AA10000006;;;\n";
    tempFileContent += "14.08.2026;0210 00012345;0210 00012345 R800;0210 00012345.S3;26.01.2026;;28.01.2026;28.01.2026;Kauf aus Emission;CSIF (CH) Equity Sample -P-;;1895681;CH0189956813;;0.415;CHF;2410.55;;CHF;1000;;;;;R5P026AA10000001;Aktien;Stammaktien;Anlagefonds";

    // Act
    sut.processFileContents(tempFileContent, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBe(1);
      expect(actualExport.activities[0].type.toString()).toBe("BUY");

      done();
    }, () => { done.fail("Should not have an error!"); });
  });
});
