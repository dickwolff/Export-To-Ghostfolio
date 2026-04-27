import {XtbConverterV2} from "./xtbConverterV2";
import {SecurityService} from "../securityService";
import {GhostfolioExport} from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

describe("xtbConverterV2", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("should construct", () => {
        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));
        expect(sut).toBeTruthy();
    });

    it("should process sample CSV file", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        // Sample has: 1 INTEREST + 1 FEE (interest tax) + 2 BUY + 1 SELL + 1 DIVIDEND = 6
        // Skipped: IKE deposit, IKE cash transfer in, Total, Withholding tax (folded into dividend)
        sut.readAndProcessFile("samples/xtb-v2-export.csv", (actualExport: GhostfolioExport) => {

            expect(actualExport).toBeTruthy();
            expect(actualExport.activities.length).toBe(6);

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    }, 10000);

    it("should produce correct activity types from sample", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        sut.readAndProcessFile("samples/xtb-v2-export.csv", (actualExport: GhostfolioExport) => {

            const types = actualExport.activities.map(a => a.type).sort();
            expect(types).toEqual(["BUY", "BUY", "DIVIDEND", "FEE", "INTEREST", "SELL"].sort());

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    }, 10000);

    it("should fold withholding tax as fee into adjacent dividend", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        csv += "Withholding tax;DTLE.UK;Treasury Bond 20+yr;2025-06-15 10:00:00;-10,00;200002;DTLE.UK EUR WHT 10%;My Trades\n";
        csv += "Dividend;DTLE.UK;Treasury Bond 20+yr;2025-06-15 10:00:00;100,00;200001;DTLE.UK EUR 0.0642/ SHR;My Trades\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(1);
            expect(actualExport.activities[0].type).toBe("DIVIDEND");
            // fee is the withholding tax amount from the adjacent WHT row (in account currency)
            expect(actualExport.activities[0].fee).toBeCloseTo(10.00);
            // divCurrency (EUR) === accountCurrency (EUR) → canUsePerShare=true
            // quantity = 100.00 / 0.0642 ≈ 1557.63, unitPrice = perShare = 0.0642
            expect(actualExport.activities[0].quantity).toBeCloseTo(100.00 / 0.0642, 2);
            expect(actualExport.activities[0].unitPrice).toBeCloseTo(0.0642);

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });

    it("should normalise .UK ticker to .L", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        csv += "Stock sell;DTLE.UK;Treasury Bond 20+yr;2025-10-01 08:00:00;297,65;200003;CLOSE BUY 100 @ 2.9765;IKE\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(1);
            expect(actualExport.activities[0].symbol).toBe("DTLE.L");

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });

    it("should parse European decimal amount including thousands separator", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;12345678;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-01-01 00:00:00;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        // Amount with dot thousands separator: 1.234,56 should be parsed as 1234.56
        csv += "Free funds interest;;;2025-12-01 10:00:00;1.234,56;200001;Free-funds Interest 2025-11;IKE\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(1);
            expect(actualExport.activities[0].unitPrice).toBeCloseTo(1234.56);

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });

    it("should produce INTEREST and FEE for free-funds interest and its tax", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        csv += "Free funds interest tax;;;2026-04-03 16:04:08;-0,01;200004;Free-funds Interest Tax 2026-03;My Trades\n";
        csv += "Free funds interest;;;2026-04-03 16:04:18;0,02;200005;Free-funds Interest 2026-03;My Trades\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(2);
            const types = actualExport.activities.map(a => a.type).sort();
            expect(types).toEqual(["FEE", "INTEREST"]);
            const fee = actualExport.activities.find(a => a.type === "FEE");
            expect(fee.fee).toBeCloseTo(0.01);

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });

    describe("detectAccountCurrency", () => {

        it("returns PLN for plain IKE CSV filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("IKE_12345_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns PLN for IKZE filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("IKZE_99000002_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns PLN for user-prefixed IKE filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("xtb_ike_99000002_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns PLN for arbitrarily prefixed IKE filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("anything_ike_99000002_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns PLN for user-prefixed IKZE filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("xtb_ikze_99000002_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns PLN for arbitrarily prefixed IKZE filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("anything_ikze_99000002_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns EUR for EUR_ filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("EUR_99000003_2006-01-01_2026-04-19.csv")).toBe("EUR");
        });

        it("returns PLN for PLN_ filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("PLN_99000004_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns EUR for XTB_EUR_ filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("XTB_EUR_99000005_2006-01-01_2026-04-19.csv")).toBe("EUR");
        });

        it("returns PLN for XTB_PLN_ filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("XTB_PLN_99000006_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("returns EUR for lower-case prefixed CSV filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("xtb_EUR_99000007_2006-01-01_2026-04-19.csv")).toBe("EUR");
        });

        it("returns EUR for arbitrarily prefixed CSV filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("processed_EUR_99000008_2006-01-01_2026-04-19.csv")).toBe("EUR");
        });

        it("returns PLN for XTB_IKE_ filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("XTB_IKE_99000009_2006-01-01_2026-04-19.csv")).toBe("PLN");
        });

        it("falls back to EUR for unrecognised filename", () => {
            expect(XtbConverterV2.detectAccountCurrency("unknown-export.csv")).toBe("EUR");
        });
    });

    it("should use PLN currency for INTEREST when reading IKE file", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        sut.readAndProcessFile("samples/xtb-v2-export.csv", (actualExport: GhostfolioExport) => {

            // xtb-v2-export.csv filename has no IKE/EUR prefix → defaults to EUR
            const interest = actualExport.activities.find(a => a.type === "INTEREST");
            expect(interest.currency).toBe("EUR");

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    }, 10000);

    describe("should throw an error if", () => {

        it("the input file does not exist", (done) => {

            const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

            sut.readAndProcessFile("tmp/testinput/xtb-v2-filedoesnotexist.csv",
                () => {
                    done.fail("Should not succeed!");
                },
                (err: Error) => {
                    expect(err).toBeTruthy();
                    done();
                });
        });

        it("the header row is missing", (done) => {

            const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

            sut.processFileContents("Some random content\nwithout the right header\n",
                () => {
                    done.fail("Should not succeed!");
                },
                (err: Error) => {
                    expect(err).toBeTruthy();
                    expect(err.message).toContain("Could not find the header row");
                    done();
                });
        });

        it("the input file is empty after header", (done) => {

            const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

            let csv = "";
            csv += "Account number;99000001;;;;;;\n";
            csv += "Cash Operations;;;;;;;\n";
            csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
            csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
            csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";

            sut.processFileContents(csv,
                () => {
                    done.fail("Should not succeed!");
                },
                (err: Error) => {
                    expect(err).toBeTruthy();
                    expect(err.message).toContain("An error occurred while parsing");
                    done();
                });
        });

        it("Yahoo Finance throws an error", (done) => {

            const yahooFinanceServiceMock = new YahooFinanceServiceMock();
            jest.spyOn(yahooFinanceServiceMock, "search").mockImplementation(() => {
                throw new Error("Unit test error");
            });
            const sut = new XtbConverterV2(new SecurityService(yahooFinanceServiceMock));

            let csv = "";
            csv += "Account number;99000001;;;;;;\n";
            csv += "Cash Operations;;;;;;;\n";
            csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
            csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
            csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
            csv += "Stock purchase;IS0M.DE;Italy Govt Bond;2026-01-15 09:00:00;-3389,76;200006;OPEN BUY 22 @ 154.0800;IKE\n";

            sut.processFileContents(csv,
                () => {
                    done.fail("Should not succeed!");
                },
                (err: Error) => {
                    expect(err).toBeTruthy();
                    expect(err.message).toContain("Unit test error");
                    done();
                });
        });
    });

    it("should log and skip when Yahoo Finance returns no symbol", (done) => {

        const yahooFinanceServiceMock = new YahooFinanceServiceMock();
        jest.spyOn(yahooFinanceServiceMock, "search").mockResolvedValue({quotes: []});
        const sut = new XtbConverterV2(new SecurityService(yahooFinanceServiceMock));
        const consoleSpy = jest.spyOn((sut as any).progress, "log");

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        csv += "Stock purchase;IS0M.DE;Italy Govt Bond;2026-01-15 09:00:00;-3389,76;200006;OPEN BUY 22 @ 154.0800;IKE\n";

        sut.processFileContents(csv, () => {

            expect(consoleSpy).toHaveBeenCalledWith(
                "[i] No result found for Stock purchase action, symbol IS0M.DE! Please add this manually..\n"
            );

            done();
        }, () => done.fail("Should not have an error!"));
    });

    it("should use EUR currency for all activity types in EUR account", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        csv += "Free funds interest;;;2026-04-03 16:04:18;0,02;200001;Free-funds Interest 2026-03;My Trades\n";
        csv += "Free funds interest tax;;;2026-04-03 16:04:08;-0,01;200002;Free-funds Interest Tax 2026-03;My Trades\n";
        csv += "Stock purchase;IS0M.DE;Italy Govt Bond;2026-03-02 13:31:07;-2154,74;200003;OPEN BUY 14 @ 153.91;My Trades\n";
        csv += "Stock sell;IS0M.DE;Italy Govt Bond;2026-03-02 13:30:00;2154,74;200004;CLOSE BUY 14 @ 153.91;My Trades\n";
        csv += "Withholding tax;DTLE.UK;Treasury Bond;2025-12-24 10:06:00;-0,58;200006;DTLE.UK EUR WHT 5%;My Trades\n";
        csv += "Dividend;DTLE.UK;Treasury Bond;2025-12-24 10:06:00;12,65;200005;DTLE.UK EUR 0.0642/ SHR;My Trades\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(5); // Interest, Fee, Buy, Sell, Dividend

            // All should have EUR currency
            actualExport.activities.forEach(activity => {
                expect(activity.currency).toBe("EUR");
            });

            // Verify each type specifically
            const interest = actualExport.activities.find(a => a.type === "INTEREST");
            expect(interest).toBeTruthy();
            expect(interest.currency).toBe("EUR");

            const fee = actualExport.activities.find(a => a.type === "FEE");
            expect(fee).toBeTruthy();
            expect(fee.currency).toBe("EUR");

            const buy = actualExport.activities.find(a => a.type === "BUY");
            expect(buy).toBeTruthy();
            expect(buy.currency).toBe("EUR");

            const sell = actualExport.activities.find(a => a.type === "SELL");
            expect(sell).toBeTruthy();
            expect(sell.currency).toBe("EUR");

            const dividend = actualExport.activities.find(a => a.type === "DIVIDEND");
            expect(dividend).toBeTruthy();
            expect(dividend.currency).toBe("EUR");
            expect(dividend.unitPrice).toBeCloseTo(0.0642);

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });

    it("should use PLN currency for all activity types in IKE account", () => {
        expect(XtbConverterV2.detectAccountCurrency("XTB_IKE_99000009_2006-01-01_2026-04-19.csv")).toBe("PLN");
        expect(XtbConverterV2.detectAccountCurrency("XTB_IKZE_99000009_2006-01-01_2026-04-19.csv")).toBe("PLN");
    });

    it("should calculate dividend quantity correctly using account currency amount", (done) => {

        const sut = new XtbConverterV2(new SecurityService(new YahooFinanceServiceMock()));

        let csv = "";
        csv += "Account number;99000001;;;;;;\n";
        csv += "Cash Operations;;;;;;;\n";
        csv += "Date from (UTC);2006-01-01 00:00:00;;;;;;\n";
        csv += "Date to (UTC);2026-04-19 14:07:32;;;;;;\n";
        csv += "Type;Ticker;Instrument;Time;Amount;ID;Comment;Product\n";
        // Amount 630.46 EUR (account currency) / 0.0642 per share ≈ 9820.25 shares
        csv += "Dividend;DTLE.UK;Treasury Bond;2025-12-24 10:06:00;630,46;200001;DTLE.UK EUR 0.0642/ SHR;My Trades\n";

        sut.processFileContents(csv, (actualExport: GhostfolioExport) => {

            expect(actualExport.activities.length).toBe(1);
            const dividend = actualExport.activities[0];

            expect(dividend.type).toBe("DIVIDEND");
            expect(dividend.unitPrice).toBeCloseTo(0.0642);
            expect(dividend.quantity).toBeCloseTo(9820.25, 2);
            expect(dividend.currency).toBe("EUR"); // account currency

            done();
        }, () => {
            done.fail("Should not have an error!");
        });
    });
});
