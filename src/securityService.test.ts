import * as cacache from "cacache";
import { SecurityService } from "./securityService";
import YahooFinanceServiceMock from "./testing/yahooFinanceServiceMock";

describe("securityService", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {

        // Act
        const sut = new SecurityService(new YahooFinanceServiceMock());

        // Assert
        expect(sut).toBeTruthy();
    });

    describe("getSecurity()", () => {
        describe("having no symbols in cache", () => {
            describe("having ISIN", () => {
                it("and YahooFinance returns one quote, should return symbol", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                        quotes: [
                            {
                                symbol: "AAPL"
                            }
                        ]
                    });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                        price: {
                            regularMarketPrice: 100,
                            currency: "USD",
                            exchange: "NMS",
                            symbol: "AAPL"
                        }
                    });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity("US0378331005", null, null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                });

                it("and YahooFinance returns three quotes, should return first symbol", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                        quotes: [
                            {
                                symbol: "AAPL"
                            },
                            {
                                symbol: "NVDA"
                            },
                            {
                                symbol: "TSLA"
                            }
                        ]
                    });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 100,
                                currency: "USD",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        }).mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 400,
                                currency: "USD",
                                exchange: "NMS",
                                symbol: "NVDA"
                            }
                        }).mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 80,
                                currency: "USD",
                                exchange: "NMS",
                                symbol: "TSLA"
                            }
                        })

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity("US0378331005", null, null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(3);
                });
            });

            describe("having ISIN and symbol", () => {
                it("and Yahoo Finance returns no result for ISIN, should search by symbol", async () => {
                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValueOnce({
                            quotes: []
                        })
                        .mockResolvedValueOnce({
                            quotes: [
                                {
                                    symbol: "AAPL"
                                }
                            ]
                        });

                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 100,
                                currency: "USD",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity("US0378331005", "AAPL", null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(2);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                })
            });

            describe("having only symbol", () => {
                it("and YahooFinance returns one quote, should return symbol", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                        quotes: [
                            {
                                symbol: "AAPL"
                            }
                        ]
                    });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                        price: {
                            regularMarketPrice: 100,
                            currency: "USD",
                            exchange: "NMS",
                            symbol: "AAPL"
                        }
                    });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, "AAPL", null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                });
            });

            describe("having expected currency", () => {
                it("and YahooFinance returns three quotes, should return symbol with matching currency", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                        quotes: [
                            {
                                symbol: "AAPL"
                            }
                        ]
                    });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 100,
                                currency: "EUR",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        }).mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 400,
                                currency: "USD",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        }).mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 80,
                                currency: "ISK",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        })

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    const security = await sut.getSecurity(null, "AAPL", null, "USD");

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(2);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(2);
                    expect(security.currency).toBe("USD");
                });

                it("and expected currency is GBP, YahooFinance returns GBp, should return symbol with matching currency", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                        quotes: [
                            {
                                symbol: "AAPL"
                            }
                        ]
                    });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValueOnce({
                            price: {
                                regularMarketPrice: 100,
                                currency: "GBp",
                                exchange: "NMS",
                                symbol: "AAPL"
                            }
                        });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    const security = await sut.getSecurity(null, "AAPL", null, "GBP");

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                    expect(security.currency).toBe("GBp");
                });
            });

            describe("having only name", () => {
                it("and YahooFinance returns one quote, should return symbol", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValue({
                            quotes: [
                                {
                                    symbol: "AAPL"
                                }
                            ]
                        });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                        price: {
                            regularMarketPrice: 100,
                            currency: "USD",
                            exchange: "NMS",
                            symbol: "AAPL"
                        }
                    });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, null, "Apple Inc.", null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                });

                it("and YahooFinance does not find a full match, so a partial match is searched and found, should return symbol", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValueOnce({
                            quotes: []
                        })
                        .mockResolvedValueOnce({
                            quotes: [
                                {
                                    symbol: "FIHBX"
                                }
                            ]
                        });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                        price: {
                            regularMarketPrice: 100,
                            currency: "USD",
                            exchange: "NDQ",
                            symbol: "FIHBX"
                        }
                    });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, null, "FEDERATED HERMES INSTL HIGH YIELD BD IS", null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(2);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                });
            });

            describe("having Yahoo Finance returns invalid data", () => {
                it("with search result without a symbol, skips", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValue({
                            quotes: [
                                {
                                    symbol: null,
                                },
                                {
                                    symbol: "VWRL.AS"
                                },
                            ]
                        });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValue({
                            price: {
                                regularMarketPrice: 100,
                                currency: "EUR",
                                exchange: "EMA",
                                symbol: "VWRL"
                            }
                        });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, "VWRL", null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(1);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
                });

                it("and throws an error for quoteSummary, skips", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValue({
                            quotes: [
                                {
                                    symbol: "VWRL.AS"
                                },
                            ]
                        });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockImplementationOnce(() => { throw new Error("Unit test") })
                        .mockResolvedValue({
                            price: {
                                regularMarketPrice: 100,
                                currency: "EUR",
                                exchange: "EMA",
                                symbol: "VWRL"
                            }
                        });

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, "VWRL", null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(2);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(2);
                });

                it("with quoteSummary result without a price, skips", async () => {

                    // Arrange
                    const yahooFinanceMock = new YahooFinanceServiceMock();
                    const searchSpy = jest.spyOn(yahooFinanceMock, "search")
                        .mockResolvedValue({
                            quotes: [
                                {
                                    symbol: "VWRL.AS"
                                },
                            ]
                        });
                    const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary")
                        .mockResolvedValue({});

                    // Act
                    const sut = new SecurityService(yahooFinanceMock);
                    await sut.getSecurity(null, "VWRL", null, null);

                    // Assert
                    expect(searchSpy).toHaveBeenCalledTimes(2);
                    expect(quoteSummarySpy).toHaveBeenCalledTimes(2);
                });
            });
        });

        describe("having symbols in cache", () => {
            it("when symbol without ISIN is searched for a second time, retrieves it from symbol cache but searches for ISIN", async () => {

                // Arrange
                const yahooFinanceMock = new YahooFinanceServiceMock();
                const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                    quotes: [
                        {
                            symbol: "AAPL"
                        }
                    ]
                });
                const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                    price: {
                        regularMarketPrice: 100,
                        currency: "USD",
                        exchange: "NMS",
                        symbol: "AAPL"
                    }
                });

                // Act                
                const sut = new SecurityService(yahooFinanceMock);
                await sut.getSecurity(null, "AAPL", null, null);
                await sut.getSecurity(null, "AAPL", null, null);

                // Assert
                expect(searchSpy).toHaveBeenCalledTimes(1);
                expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
            });

            it("when ISIN is searched for a second time, retrieves it from ISIN cache", async () => {

                // Arrange
                const yahooFinanceMock = new YahooFinanceServiceMock();
                const searchSpy = jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                    quotes: [
                        {
                            symbol: "AAPL"
                        }
                    ]
                });
                const quoteSummarySpy = jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                    price: {
                        regularMarketPrice: 100,
                        currency: "USD",
                        exchange: "NMS",
                        symbol: "AAPL"
                    }
                });

                // Act                
                const sut = new SecurityService(yahooFinanceMock);
                await sut.getSecurity("US0378331005", "AAPL", null, null);
                await sut.getSecurity("US0378331005", "AAPL", null, null);

                // Assert
                expect(searchSpy).toHaveBeenCalledTimes(1);
                expect(quoteSummarySpy).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe("loadCache()", () => {

        beforeEach(async () => {
            await cacache.rm("/var/tmp/e2g-cache-unittest", "isinSymbolCache");
            await cacache.rm("/var/tmp/e2g-cache-unittest", "symbolCache");
        });

        it("having no initial cache, does not restore", async () => {

            // Arrange
            const yahooFinanceMock = new YahooFinanceServiceMock();
            const sut = new SecurityService(yahooFinanceMock);

            // Act
            const cache = await sut.loadCache();

            // Assert
            expect(cache[0]).toBe(0);
            expect(cache[1]).toBe(0);
        });

        it("after retrieving a symbol for the first time, does restore it from cache a second time", async () => {

            // Arrange
            const yahooFinanceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceMock, "search").mockResolvedValue({
                quotes: [
                    {
                        symbol: "AAPL"
                    }
                ]
            });
            jest.spyOn(yahooFinanceMock, "quoteSummary").mockResolvedValue({
                price: {
                    regularMarketPrice: 100,
                    currency: "USD",
                    exchange: "NMS",
                    symbol: "AAPL"
                }
            });

            // Act I
            const sut = new SecurityService(yahooFinanceMock);
            let cache = await sut.loadCache();

            // Assert I
            expect(cache[0]).toBe(0);
            expect(cache[1]).toBe(0);
            
            // Act II
            await sut.getSecurity("US0378331005", null, null, null);
            cache = await sut.loadCache();

            // Assert II
            expect(cache[0]).toBe(1);
            expect(cache[1]).toBe(1);
        });
    });
});
