import { YahooFinanceService } from "./yahooFinanceService";
import { YahooFinanceTestdata } from "./testing/yahooFinanceTestdataWriter";

// Mock the yahoo-finance2 module
jest.mock("yahoo-finance2", () => {
    return jest.fn().mockImplementation(() => ({
        search: jest.fn().mockResolvedValue({
            quotes: [{ symbol: "AAPL", shortname: "Apple Inc." }]
        }),
        quoteSummary: jest.fn().mockResolvedValue({
            price: { regularMarketPrice: 150, currency: "USD" }
        })
    }));
});

class YahooFinanceTestdataWriterMock implements YahooFinanceTestdata {
    public searchResults: Map<string, any> = new Map();
    public quoteSummaryResults: Map<string, any> = new Map();

    addSearchResult(query: string, result: any) {
        this.searchResults.set(query, result);
    }
    addQuoteSummaryResult(symbol: string, result: any) {
        this.quoteSummaryResults.set(symbol, result);
    }
}

describe("yahooFinanceService", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("constructor", () => {
        it("should construct without config", () => {
            // Act
            const sut = new YahooFinanceService();

            // Assert
            expect(sut).toBeTruthy();
        });

        it("should construct with config", () => {
            // Act
            const sut = new YahooFinanceService({
                queue: { timeout: 30000 }
            });

            // Assert
            expect(sut).toBeTruthy();
        });

        it("should construct with testdata writer", () => {
            // Act
            const sut = new YahooFinanceService({}, new YahooFinanceTestdataWriterMock());

            // Assert
            expect(sut).toBeTruthy();
        });

        it("should construct with both config and testdata writer", () => {
            // Act
            const sut = new YahooFinanceService(
                { queue: { timeout: 30000 } },
                new YahooFinanceTestdataWriterMock()
            );

            // Assert
            expect(sut).toBeTruthy();
        });
    });

    describe("search()", () => {
        it("should return search results", async () => {
            // Arrange
            const sut = new YahooFinanceService();

            // Act
            const result = await sut.search("AAPL");

            // Assert
            expect(result).toBeDefined();
            expect(result.quotes).toBeDefined();
            expect(result.quotes.length).toBeGreaterThan(0);
            expect(result.quotes[0].symbol).toBe("AAPL");
        });

        it("should pass query options to yahoo-finance2", async () => {
            // Arrange
            const sut = new YahooFinanceService();
            const queryOptions = { quotesCount: 5, newsCount: 0 };

            // Act
            const result = await sut.search("AAPL", queryOptions);

            // Assert
            expect(result).toBeDefined();
        });

        it("should pass module options to yahoo-finance2", async () => {
            // Arrange
            const sut = new YahooFinanceService();
            const moduleOptions = { validateResult: false };

            // Act
            const result = await sut.search("AAPL", {}, moduleOptions);

            // Assert
            expect(result).toBeDefined();
        });

        it("should save result to testdata writer if provided", async () => {
            // Arrange
            const testdataWriter = new YahooFinanceTestdataWriterMock();
            const sut = new YahooFinanceService({}, testdataWriter);

            // Act
            await sut.search("AAPL");

            // Assert
            expect(testdataWriter.searchResults.has("AAPL")).toBe(true);
            expect(testdataWriter.searchResults.get("AAPL")).toBeDefined();
        });

        it("should not fail if testdata writer is not provided", async () => {
            // Arrange
            const sut = new YahooFinanceService();

            // Act & Assert - should not throw
            await expect(sut.search("AAPL")).resolves.toBeDefined();
        });
    });

    describe("quoteSummary()", () => {
        it("should return quote summary", async () => {
            // Arrange
            const sut = new YahooFinanceService();

            // Act
            const result = await sut.quoteSummary("AAPL");

            // Assert
            expect(result).toBeDefined();
            expect(result.price).toBeDefined();
            expect(result.price.regularMarketPrice).toBe(150);
            expect(result.price.currency).toBe("USD");
        });

        it("should pass query options to yahoo-finance2", async () => {
            // Arrange
            const sut = new YahooFinanceService();
            const queryOptions = { modules: ["price", "summaryDetail"] };

            // Act
            const result = await sut.quoteSummary("AAPL", queryOptions);

            // Assert
            expect(result).toBeDefined();
        });

        it("should pass module options to yahoo-finance2", async () => {
            // Arrange
            const sut = new YahooFinanceService();
            const moduleOptions = { validateResult: false };

            // Act
            const result = await sut.quoteSummary("AAPL", {}, moduleOptions);

            // Assert
            expect(result).toBeDefined();
        });

        it("should save result to testdata writer if provided", async () => {
            // Arrange
            const testdataWriter = new YahooFinanceTestdataWriterMock();
            const sut = new YahooFinanceService({}, testdataWriter);

            // Act
            await sut.quoteSummary("AAPL");

            // Assert
            expect(testdataWriter.quoteSummaryResults.has("AAPL")).toBe(true);
            expect(testdataWriter.quoteSummaryResults.get("AAPL")).toBeDefined();
        });

        it("should not fail if testdata writer is not provided", async () => {
            // Arrange
            const sut = new YahooFinanceService();

            // Act & Assert - should not throw
            await expect(sut.quoteSummary("AAPL")).resolves.toBeDefined();
        });
    });
});

