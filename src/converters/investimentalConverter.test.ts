import { InvestimentalConverter } from "./investimentalConverter";
import { SecurityService } from "../securityService";
import { GhostfolioExport } from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";
import { InvestimentalRecord } from "../models/investimentalRecord";


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
      expect(actualExport.activities.length).toBe(7);

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

  describe("test combineRecords", () => {
    let sut: InvestimentalConverter;

    beforeEach(() => {
      sut = new InvestimentalConverter(new SecurityService(new YahooFinanceServiceMock()));
    });

    it("should return null for empty records array", () => {
      // Act
      const result = sut.combineRecords([]);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null when no executed volume", () => {
      // Arrange
      const records: InvestimentalRecord[] = [
        {
          orderID: "6750",
          orderNumber: "58525243",
          side: "Buy",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 24.655,
          volume: 20,
          disclosed: 0,
          value: 493.1,
          fee: 3.27,
          term: "Day",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 0,
          lastTradeTicket: 0,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "New",
          updateTime: "2024-03-05 10:15:40",
          requestId: "",
          requestType: "",
          requestStatus: ""
        }
      ];

      // Act
      const result = sut.combineRecords(records);

      // Assert
      expect(result).toBeNull();
    });

    it("should combine records with single fill execution", () => {
      // Arrange
      const records: InvestimentalRecord[] = [
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.8,
          volume: 210,
          disclosed: 0,
          value: 5838,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 0,
          lastTradeTicket: 0,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "New",
          updateTime: "2024-05-31 09:45:00",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.19,
          volume: 64,
          disclosed: 0,
          value: 0,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15094,
          lastTradeTicket: 24734269,
          status: "Inactive",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:48:44",
          requestId: "",
          requestType: "",
          requestStatus: ""
        }
      ];

      // Act
      const result = sut.combineRecords(records);

      // Assert
      expect(result).toBeTruthy();
      expect(result!.volume).toBe(64); // When status is Inactive, executed volume = record.volume = 64
      expect(result!.price).toBe(27.19);
      expect(result!.fee).toBe(0);
      expect(result!.status).toBe("Inactive");
      expect(result!.updateType).toBe("Fil");
    });

    it("should combine records with multiple fills and calculate average price", () => {
      // Arrange
      const records: InvestimentalRecord[] = [
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.8,
          volume: 210,
          disclosed: 0,
          value: 5838,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 0,
          lastTradeTicket: 0,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "New",
          updateTime: "2024-05-31 09:45:00",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.185,
          volume: 200,
          disclosed: 0,
          value: 5437,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15086,
          lastTradeTicket: 24734177,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:41:49",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.19,
          volume: 145,
          disclosed: 0,
          value: 3942.55,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15087,
          lastTradeTicket: 24734207,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:44:12",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.19,
          volume: 137,
          disclosed: 0,
          value: 3725.03,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15092,
          lastTradeTicket: 24734255,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:47:24",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.19,
          volume: 64,
          disclosed: 0,
          value: 1740.16,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15093,
          lastTradeTicket: 24734266,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:48:32",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "13268",
          orderNumber: "59479550",
          side: "Sell",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 27.19,
          volume: 64,
          disclosed: 0,
          value: 0,
          fee: 0,
          term: "Open",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 15094,
          lastTradeTicket: 24734269,
          status: "Inactive",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-05-31 12:48:44",
          requestId: "",
          requestType: "",
          requestStatus: ""
        }
      ];

      // Act
      const result = sut.combineRecords(records);

      // Assert
      expect(result).toBeTruthy();
      expect(result!.volume).toBe(210); // 10 + 55 + 8 + 73 + 64 = 210 executed
      expect(result!.price).toBe(27.1898); // Calculated average price rounded to 4 decimal places
      expect(result!.fee).toBe(0);
      expect(result!.status).toBe("Inactive");
    });

    it("should handle records with missing fee values", () => {
      // Arrange
      const records: InvestimentalRecord[] = [
        {
          orderID: "6750",
          orderNumber: "58525243",
          side: "Buy",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 24.655,
          volume: 20,
          disclosed: 0,
          value: 493.1,
          fee: 3.27,
          term: "Day",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 0,
          lastTradeTicket: 0,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "New",
          updateTime: "2024-03-05 10:15:40",
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "6750",
          orderNumber: "58525243",
          side: "Buy",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 24.745,
          volume: 20,
          disclosed: 0,
          value: 0,
          fee: 0, // Missing fee
          term: "Day",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 7573,
          lastTradeTicket: 24141773,
          status: "Inactive",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-03-05 12:06:20",
          requestId: "",
          requestType: "",
          requestStatus: ""
        }
      ];

      // Act
      const result = sut.combineRecords(records);

      // Assert
      expect(result).toBeTruthy();
      expect(result!.volume).toBe(20);
      expect(result!.price).toBe(24.745);
      expect(result!.fee).toBe(3.27); // Should use last valid fee
    });

    it("should sort records by update time before processing", () => {
      // Arrange
      const records: InvestimentalRecord[] = [
        {
          orderID: "6750",
          orderNumber: "58525243",
          side: "Buy",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 24.745,
          volume: 20,
          disclosed: 0,
          value: 0,
          fee: 3.28,
          term: "Day",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 7573,
          lastTradeTicket: 24141773,
          status: "Inactive",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "Fil",
          updateTime: "2024-03-05 12:06:20", // Later time
          requestId: "",
          requestType: "",
          requestStatus: ""
        },
        {
          orderID: "6750",
          orderNumber: "58525243",
          side: "Buy",
          exchange: "BVB",
          symbol: "TVBETETF",
          market: "REGS",
          price: 24.655,
          volume: 20,
          disclosed: 0,
          value: 493.1,
          fee: 3.27,
          term: "Day",
          validity: "",
          triggerType: "None",
          triggerPrice: 0,
          settlementTerm: "T+2",
          settlementDate: "",
          settlementType: "Net",
          shortSell: "No",
          accountId: "JD123456RR1",
          accountName: "JOHN DOE [RON]",
          lastTradeId: 0,
          lastTradeTicket: 0,
          status: "Active",
          initiatedBy: "JD123456",
          updatedBy: "JD123456",
          updateType: "New",
          updateTime: "2024-03-05 10:15:40", // Earlier time
          requestId: "",
          requestType: "",
          requestStatus: ""
        }
      ];

      // Act
      const result = sut.combineRecords(records);

      // Assert
      expect(result).toBeTruthy();
      expect(result!.volume).toBe(20);
      expect(result!.price).toBe(24.745);
      expect(result!.fee).toBe(3.28);
      expect(result!.updateTime).toBe("2024-03-05 12:06:20"); // Should use last record's time
    });
  });
});
