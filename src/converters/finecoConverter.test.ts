import { FinecoConverter } from "./finecoConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("finecoConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arrange
    const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/fineco-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(14);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/fineco-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += "Operazione,Data valuta,Descrizione,Titolo,Isin,Segno,Quantita,Divisa,Prezzo,Cambio,Controvalore,Commissioni Fondi Sw/Ingr/Uscita,Commissioni Fondi Banca Corrispondente,Spese Fondi Sgr,Commissioni amministrato\n";

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
      const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "";
      tempFileContent += "Operazione,Data valuta,Descrizione,Titolo,Isin,Segno,Quantita,Divisa,Prezzo,Cambio,Controvalore,Commissioni Fondi Sw/Ingr/Uscita,Commissioni Fondi Banca Corrispondente,Spese Fondi Sgr,Commissioni amministrato\n";
      tempFileContent += "15/01/2024,17/01/2024,Compravendita titoli,ISHARES MSCI WORLD ACC,IE00B4L5Y983,A,5,EUR,105.71,,528.55,,,,2.95,extra_column\n";

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toBe("An error occurred while parsing! Details: Invalid Record Length: columns length is 15, got 16 on line 2");

        done();
      });
    });
  });

  it("should log when Yahoo Finance returns no symbol", (done) => {

    // Arrange
    let tempFileContent = "";

    // Add preamble rows.
    for (let i = 0; i < 5; i++) {
      tempFileContent += "\n";
    }

    tempFileContent += "Operazione,Data valuta,Descrizione,Titolo,Isin,Segno,Quantita,Divisa,Prezzo,Cambio,Controvalore,Commissioni Fondi Sw/Ingr/Uscita,Commissioni Fondi Banca Corrispondente,Spese Fondi Sgr,Commissioni amministrato\n";
    tempFileContent += "15/01/2024,17/01/2024,Compravendita titoli,UNKNOWN SECURITY,XXXXXXXX,A,5,EUR,105.71,,528.55,,,,2.95";

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new FinecoConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for buy action for XXXXXXXX with currency EUR! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });

  it("should invoke errorCallback when header row is not found", (done) => {

    // Arrange
    const tempFileContent = "ID;Type;Time;Symbol;Comment;Amount\n";
    const sut = new FinecoConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    sut.processFileContents(tempFileContent, () => {
      done.fail("Should not succeed!");
    }, (err: Error) => {

      // Assert
      expect(err).toBeTruthy();
      expect(err.message).toContain("Could not find header row");

      done();
    });
  });
});
