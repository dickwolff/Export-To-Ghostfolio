import { AbstractConverter } from "./converters/abstractconverter";
import { SecurityService } from "./securityService";
import YahooFinanceServiceMock from "./testing/yahooFinanceServiceMock";

// Concrete subclass for testing
class TestConverter extends AbstractConverter {
    constructor(securityService: SecurityService) {
        super(securityService);
    }
    isIgnoredRecord(record: any): boolean {
        return false;
    }
    processFileContents(input: string, successCallback: CallableFunction, errorCallback: CallableFunction): void {
        // not needed for header tests
    }
    exposeProcessHeaders(csvFile: string, splitChar = ","): string[] {
        return this.processHeaders(csvFile, splitChar);
    }
}

describe("AbstractConverter.processHeaders", () => {

    let converter: TestConverter;

    beforeAll(() => {
        const mockYahoo = new YahooFinanceServiceMock();
        const securityService = new SecurityService(mockYahoo);
        converter = new TestConverter(securityService);
    });

    it("should map 'Time (UTC)' to 'time'", () => {
        // Arrange
        const csvContent = "Action,Time (UTC),ISIN,Ticker,Name\nBuy,2025-01-01 10:00:00+00:00,US123,AAPL,Apple\n";

        // Act
        const headers = converter.exposeProcessHeaders(csvContent);

        // Assert
        expect(headers).toContain("time");
        expect(headers).not.toContain("timeUTC");
    });

    it("should map 'Time' to 'time' (backward compatible)", () => {
        // Arrange
        const csvContent = "Action,Time,ISIN,Ticker,Name\nBuy,2025-01-01,AAPL,Apple\n";

        // Act
        const headers = converter.exposeProcessHeaders(csvContent);

        // Assert
        expect(headers).toContain("time");
    });

    it("should map 'iSIN' to 'isin'", () => {
        // Arrange
        const csvContent = "Action,iSIN,Ticker\nBuy,US123,AAPL\n";

        // Act
        const headers = converter.exposeProcessHeaders(csvContent);

        // Assert
        expect(headers).toContain("isin");
    });

    it("should map headers ending with 'EUR' to camelCase with 'Eur'", () => {
        // Arrange
        const csvContent = "Action,Currency (Total EUR)\nBuy,EUR\n";

        // Act
        const headers = converter.exposeProcessHeaders(csvContent);

        // Assert
        expect(headers).toContain("currencyTotalEur");
    });

    it("should handle all Trading212 headers correctly", () => {
        // Arrange - full Trading212 header
        const csvContent = "Action,Time (UTC),ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Total,Currency (Total),Withholding tax,Currency (Withholding tax),Currency conversion fee,Currency (Currency conversion fee)\n";

        // Act
        const headers = converter.exposeProcessHeaders(csvContent);

        // Assert - key headers should be mapped correctly
        expect(headers).toContain("action");
        expect(headers).toContain("time");
        expect(headers).toContain("isin");
        expect(headers).toContain("ticker");
        expect(headers).toContain("name");
        expect(headers).toContain("noOfShares");
        expect(headers).toContain("priceShare");
        expect(headers).toContain("currencyPriceShare");
    });
});
