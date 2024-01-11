import * as fs from "fs";
import { SwissquoteConverter } from "./swissquoteConverter";
import { GhostfolioExport } from "../models/ghostfolioExport";

describe("swissquoteConverter", () => {
    
  it("should construct", () => {

    // Act
    const sut = new SwissquoteConverter();

    // Asssert
    expect(sut).toBeTruthy();
  });
  
  it("should process sample CSV file", (done) => {

    // Act
    const sut = new SwissquoteConverter();
    const inputFile = "sample-swissquote-export.csv";

    // Act      
    sut.processFile(inputFile, (actualExport: GhostfolioExport) =>  {

      // Assert
      expect(actualExport).toBeTruthy();
      
      // Finish the test
      done();
    }, () => { fail("Should not have an error!"); });      
  });

  describe("should throw an error if", () => {
    beforeAll(() => {
      jest.spyOn(console, 'log').mockImplementation(jest.fn());
      jest.spyOn(console, 'error').mockImplementation(jest.fn());

      // Create test input folder before run.
      if(!fs.existsSync("tmp/testinput")) {
        fs.mkdirSync("tmp/testinput");
      }
    });

    afterAll(() => {

      // Clean test input folder after run.
      fs.rmSync("tmp/testinput", { recursive: true });
    })

    it("the input file does not exist", (done) => {

      // Act
      const sut = new SwissquoteConverter();

      let tempFileName = "tmp/testinput/swissquote-filedoesnotexist.csv";
      
      // Act
      sut.processFile(tempFileName, () =>  { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message.includes("no such file or directory")).toBeTruthy();
        done();
      });      
    });

    it("the input file is empty", (done) => {

      // Act
      const sut = new SwissquoteConverter();

      // Create temp file.
      let tempFileName = "tmp/testinput/swissquote-filedoesisempty.csv";
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";      
      fs.writeFileSync(tempFileName, tempFileContent);
      
      // Act
      sut.processFile(tempFileName, () =>  { fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error ocurred while parsing")
        done();
      });      
    });
  
    it("Yahoo Finance got empty input for query", (done) => {

      // Act
      const sut = new SwissquoteConverter();

      // Create temp file.
      let tempFileName = "tmp/testinput/swissquote-yahoofinanceerrortest.csv";
      let tempFileContent = "";
      tempFileContent += "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n";      
      tempFileContent += "10-08-2022 15:30:02;113947121;Buy;;;;200.0;19.85;5.96;0.00;-3975.96;168660.08;USD";
      fs.writeFileSync(tempFileName, tempFileContent);
      
      // Act
      sut.processFile(tempFileName, () =>  { fail("Should not succeed!"); }, (err) => {

        // Assert
        expect(err).toBeTruthy();
        done();    
      });
    });
  });
});
