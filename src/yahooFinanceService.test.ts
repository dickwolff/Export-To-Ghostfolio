import yahooFinance from "yahoo-finance2";
import { YahooFinanceService } from "./yahooFinanceService";
import { YahooFinanceTestdata } from "./testing/yahooFinanceTestdataWriter";

class YahooFinanceTestdataWriterMock implements YahooFinanceTestdata {
    addSearchResult(_, __) { }
    addQuoteSummaryResult(_, __) { }
}

describe("yahooFinanceService", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new YahooFinanceService();

        // Assert
        expect(sut).toBeTruthy();
    });

    it("setGlobalConfig() should call yahoo-finance2", () => {

        // Act
        const sut = new YahooFinanceService();

        const yahooFinance2Spy = jest.spyOn(yahooFinance, "setGlobalConfig").mockImplementation();

        // Act
        sut.setGlobalConfig({ cookieJar: null });

        // Assert
        expect(yahooFinance2Spy).toHaveBeenCalledTimes(1);
    });

    describe("search()", () => {
        it("should call yahoo-finance2", () => {

            // Act
            const sut = new YahooFinanceService();

            const yahooFinance2Spy = jest.spyOn(yahooFinance, "search").mockReturnValue(Promise.resolve({ quotes: [] }));

            // Act
            sut.search("some-quote", { quotesCount: 1 }, { validateResult: false });

            // Assert
            expect(yahooFinance2Spy).toHaveBeenCalledTimes(1);
        });

        it("should save result to yahooFinanceTestdataWriter if provided", () => {

            // Act
            const sut = new YahooFinanceService(new YahooFinanceTestdataWriterMock());

            const yahooFinance2Spy = jest.spyOn(yahooFinance, "search").mockReturnValue(Promise.resolve({ quotes: [] }));

            // Act
            sut.search("some-quote", { quotesCount: 1 }, { validateResult: false });

            // Assert
            expect(yahooFinance2Spy).toHaveBeenCalledTimes(1);
        });
    });

    describe("quoteSummary()", () => {
        it("should call yahoo-finance2", () => {

            // Act
            const sut = new YahooFinanceService();

            const yahooFinance2Spy = jest.spyOn(yahooFinance, "quoteSummary").mockReturnValue(Promise.resolve({ price: 0 }));

            // Act
            sut.quoteSummary("some-symbol", {}, { validateResult: false });

            // Assert
            expect(yahooFinance2Spy).toHaveBeenCalledTimes(1);
        });

        it("should save result to yahooFinanceTestdataWriter if provided", () => {

            // Act
            const sut = new YahooFinanceService(new YahooFinanceTestdataWriterMock());

            const yahooFinance2Spy = jest.spyOn(yahooFinance, "quoteSummary").mockReturnValue(Promise.resolve({ price: 0 }));

            // Act
            sut.quoteSummary("some-symbol", {}, { validateResult: false });

            // Assert
            expect(yahooFinance2Spy).toHaveBeenCalledTimes(1);
        });
    });
});
