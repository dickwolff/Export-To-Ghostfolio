import { SecurityService } from "../securityService";
import { AbstractConverter } from "./abstractconverter";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

// Create a test wrapper so the AbstractConverter can be tested.
class TestAbstractConverter extends AbstractConverter {
  
  // This method is covered by other tests
  isIgnoredRecord(_: any): boolean {
    return false;
  }
  
  // This method is covered by other tests.
  processFileContents(_: string, successCallback: CallableFunction, __: CallableFunction): void {
    return successCallback();
  }

  // Wrap processHeaders() so it can be tested.
  public processHeadersTest(csvFile: string, splitChar?: string): string[] {
    return this.processHeaders(csvFile, splitChar);
  }

  // Wrap logQueryError() so it can be tested.
  public logQueryErrorTest(query: string, index: number) {
    return this.logQueryError(query, index)
  }
}

describe("abstractConverter", () => {

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should construct", () => {

    // Act
    const sut = new TestAbstractConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Assert
    expect(sut).toBeTruthy();
  });

  it("processHeaders() should process headers", () => {

    // Arrange
    let tempFileContent = "";
    tempFileContent += "Type,ISIN,PriceInEUR,PriceInCHF,TransactionTimeCET\n";

    const sut = new TestAbstractConverter(new SecurityService(new YahooFinanceServiceMock()));

    // Act
    const headers = sut.processHeadersTest(tempFileContent, ",");

    // Assert
    expect(headers.length).toBe(5);
    expect(headers[1]).toBe("isin");
    expect(headers[2]).toBe("priceInEur");
    expect(headers[3]).toBe("priceInChf");
    expect(headers[4]).toBe("transactionTimeCet");
  });

  describe("logQueryError()", () => {
    it("should log a query if it was given", () => {
      // Arrange
      const sut = new TestAbstractConverter(new SecurityService(new YahooFinanceServiceMock()));
      const consoleSpy = jest.spyOn(console, "log");

      // Act
      sut.logQueryErrorTest("AAPL", 1);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("\n[e] An error occurred trying to retrieve symbol AAPL (line 3)!\n");
    });
  });

  it("should log without a query if it was not given", () => {
    // Arrange
    const sut = new TestAbstractConverter(new SecurityService(new YahooFinanceServiceMock()));
    const consoleSpy = jest.spyOn(console, "log");

    // Act
    sut.logQueryErrorTest(undefined, 2);

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith("\n[e] An error occurred trying to retrieve an empty symbol (line 4)!\n");
  });
});
