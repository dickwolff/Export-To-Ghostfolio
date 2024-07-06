import { InvestimentalConverter } from "./investimentalConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";


describe("investimentalConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new InvestimentalConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("should process sample CSV file", (done) => {

    // Arange
    const sut = new InvestimentalConverter(new SecurityService(new YahooFinanceServiceMock()));
    const inputFile = "samples/investimental-export.csv";

    // Act
    sut.readAndProcessFile(inputFile, (actualExport: GhostfolioExport) => {

      // Assert
      expect(actualExport).toBeTruthy();
      expect(actualExport.activities.length).toBeGreaterThan(0);
      expect(actualExport.activities.length).toBe(6);

      done();
    }, () => { done.fail("Should not have an error!"); });
  });

  describe("should throw an error if", () => {
    it("the input file does not exist", (done) => {

      // Arrange
      const sut = new InvestimentalConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileName = "tmp/testinput/investimental-filedoesnotexist.csv";

      // Act
      sut.readAndProcessFile(tempFileName, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();

        done();
      });
    });

    it("the input file is empty", (done) => {

      // Arrange
      const sut = new InvestimentalConverter(new SecurityService(new YahooFinanceServiceMock()));

      let tempFileContent = "Order ID,Order Number,Side,Exchange,Symbol,Market,Price,Volume,Disclosed,Value,Fee,Term,Validity,Trigger Type,Trigger Price,Settlement Term,Settlement Date,Settlement Type,Short Sell,Account ID,Account Name,Last Trade ID,Last Trade Ticket,Status,Initiated By,Updated By,Update Type,Update Time,Request ID,Request Type,Request Status\n";

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("An error ocurred while parsing");

        done();
      });
    });

    it("Yahoo Finance throws an error", (done) => {

      // Arrange
      let tempFileContent = "Order ID,Order Number,Side,Exchange,Symbol,Market,Price,Volume,Disclosed,Value,Fee,Term,Validity,Trigger Type,Trigger Price,Settlement Term,Settlement Date,Settlement Type,Short Sell,Account ID,Account Name,Last Trade ID,Last Trade Ticket,Status,Initiated By,Updated By,Update Type,Update Time,Request ID,Request Type,Request Status\n";
      tempFileContent += "6750,58525243,Buy,BVB,TVBETETF,REGS,24.745000,20,,494.900000,0,Day,,None,,T+2,,Net,No,JD123456RR1,JOHN DOE [RON],0,0,Inactive,JD123456,JD123456,Fil,2024-03-05 12:06:20,,,";

      // Mock Yahoo Finance service to throw error.
      const yahooFinanceServiceMock = new YahooFinanceServiceMock();
      jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { throw new Error("Unit test error"); });
      const sut = new InvestimentalConverter(new SecurityService(yahooFinanceServiceMock));

      // Act
      sut.processFileContents(tempFileContent, () => { done.fail("Should not succeed!"); }, (err: Error) => {

        // Assert
        expect(err).toBeTruthy();
        expect(err.message).toContain("Unit test error");

        done();
      });
    });
  });

  it("should log when YahooX Finance returns no symbol", (done) => {

    // Arrange
    let tempFileContent = "Order ID,Order Number,Side,Exchange,Symbol,Market,Price,Volume,Disclosed,Value,Fee,Term,Validity,Trigger Type,Trigger Price,Settlement Term,Settlement Date,Settlement Type,Short Sell,Account ID,Account Name,Last Trade ID,Last Trade Ticket,Status,Initiated By,Updated By,Update Type,Update Time,Request ID,Request Type,Request Status\n";
    tempFileContent += "6750,58525243,Buy,BVB,TVBETETF,REGS,24.745000,20,,494.900000,0,Day,,None,,T+2,,Net,No,JD123456RR1,JOHN DOE [RON],0,0,Inactive,JD123456,JD123456,Fil,2024-03-05 12:06:20,,,";

    // Mock Yahoo Finance service to return no quotes.
    const yahooFinanceServiceMock = new YahooFinanceServiceMock();
    jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => { return Promise.resolve({ quotes: [] }) });
    const sut = new InvestimentalConverter(new SecurityService(yahooFinanceServiceMock));

    // Bit hacky, but it works.
    const consoleSpy = jest.spyOn((sut as any).progress, "log");

    // Act
    sut.processFileContents(tempFileContent, () => {

      expect(consoleSpy).toHaveBeenCalledWith("[i] No result found for action buy, symbol TVBETETF, currency RON! Please add this manually..\n");

      done();
    }, () => done.fail("Should not have an error!"));
  });
});
