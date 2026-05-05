jest.mock("cli-progress", () => {
    class MultiBar {
        public create() {
            return {increment: jest.fn()};
        }

        public stop() {
            // no-op in tests
        }

        public log() {
            // no-op in tests
        }
    }

    return {
        MultiBar,
        Presets: {shades_classic: {}}
    };
});

import {DeGiroConverterV3} from "./degiroConverterV3";
import {SecurityService} from "../securityService";
import {GhostfolioExport} from "../models/ghostfolioExport";
import YahooFinanceServiceMock from "../testing/yahooFinanceServiceMock";

function createMockedSecurityService(isinToSymbolMap: Record<string, string>): SecurityService {
    const securityService = new SecurityService(new YahooFinanceServiceMock());

    // Mock getSecurity to return a security for each ISIN in the map
    jest.spyOn(securityService, "getSecurity").mockImplementation(async (isin: string) => {
        const symbol = isinToSymbolMap[isin];
        if (symbol) {
            return {symbol} as any;
        }
        return null;
    });

    return securityService;
}

// All test CSVs in this file use Polish-locale DEGIRO Account.csv exports.
// Polish description strings: "Kupno" (buy), "Sprzedaż" (sell),
// "DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich" (broker fee),
// "Podatek od transakcji we Włoszech" (Italian transaction tax),
// "Francuski podatek od transakcji" (French transaction tax).
describe("degiroConverterV3 transaction fee and localized tax handling (Polish-locale CSV)", () => {

    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
        jest.spyOn(console, "warn").mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("Stock in HKD on Hong Kong Exchange with DEGIRO fee and stamp duty", () => {
        it("should aggregate DEGIRO fee (6.00 EUR) + Hong Kong Stamp Duty (2.00 EUR) and convert to HKD", (done) => {
            const securityService = createMockedSecurityService({
                "CNE1000073Z4": "9973.HK"
            });
            const sut = new DeGiroConverterV3(securityService);

            let csv = "";
            csv += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
            csv += "01-06-2024,10:00,01-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Credit,9.0000,HKD,\"18000.00\",HKD,\"0.00\",aaaaaaaa-0001-0001-0001-000000000001\n";
            csv += "01-06-2024,10:00,01-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Withdrawal,,EUR,\"-2000.00\",EUR,\"5000.00\",aaaaaaaa-0001-0001-0001-000000000001\n";
            csv += "01-06-2024,10:00,01-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,\"-6.00\",EUR,\"7000.00\",aaaaaaaa-0001-0001-0001-000000000001\n";
            csv += "01-06-2024,10:00,01-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,Hong Kong Stamp Duty,,EUR,\"-2.00\",EUR,\"7006.00\",aaaaaaaa-0001-0001-0001-000000000001\n";
            csv += "01-06-2024,10:00,01-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,\"Kupno 500 Chery Automobile Co Ltd Class H@36 HKD (CNE1000073Z4)\",,HKD,\"-18000.00\",HKD,\"-18000.00\",aaaaaaaa-0001-0001-0001-000000000001\n";

            sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
                expect(actualExport.activities.length).toBe(1);
                const activity = actualExport.activities[0];

                // Costs: 6.00 EUR (DEGIRO fee) + 2.00 EUR (stamp duty) = 8.00 EUR
                // Converted: 8.00 EUR * 9.0000 (FX rate EUR→HKD) = 72.00 HKD
                expect(activity.quantity).toBe(500);
                expect(activity.unitPrice).toBe(36);
                expect(activity.currency).toBe("HKD");
                expect(activity.type).toBe("BUY");
                expect(activity.fee).toBeCloseTo(72.00, 1);

                done();
            }, (err) => {
                done(err || new Error("Should not have an error!"));
            });
        });
    });

    describe("Stock in EUR on Italian Exchange with DEGIRO fee and Italian transaction tax", () => {
        it("should aggregate DEGIRO fee (4.90 EUR) + Italian transaction tax (7.15 EUR)", (done) => {
            const securityService = createMockedSecurityService({
                "IT0003856405": "LDO.MI"
            });
            const sut = new DeGiroConverterV3(securityService);

            let csv = "";
            csv += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
            csv += "03-06-2024,10:00,03-06-2024,LEONARDO SPA,IT0003856405,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,\"-4.90\",EUR,\"100.00\",aaaaaaaa-0003-0003-0003-000000000003\n";
            csv += "03-06-2024,10:00,03-06-2024,LEONARDO SPA,IT0003856405,Podatek od transakcji we Włoszech,,EUR,\"-7.15\",EUR,\"105.00\",aaaaaaaa-0003-0003-0003-000000000003\n";
            csv += "03-06-2024,10:00,03-06-2024,LEONARDO SPA,IT0003856405,\"Kupno 50 Leonardo SpA@50 EUR (IT0003856405)\",,EUR,\"-2500.00\",EUR,\"112.00\",aaaaaaaa-0003-0003-0003-000000000003\n";

            sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
                expect(actualExport.activities.length).toBe(1);
                const activity = actualExport.activities[0];

                // Costs: 4.90 EUR (DEGIRO fee) + 7.15 EUR (Italian transaction tax) = 12.05 EUR
                // No currency conversion — activity currency is EUR
                expect(activity.quantity).toBe(50);
                expect(activity.unitPrice).toBe(50);
                expect(activity.currency).toBe("EUR");
                expect(activity.fee).toBe(12.05);

                done();
            }, (err) => {
                done(err || new Error("Should not have an error!"));
            });
        });
    });

    describe("Stock in EUR on French Exchange with DEGIRO fee and French transaction tax", () => {
        it("should aggregate DEGIRO fee (4.90 EUR) + French transaction tax (10.09 EUR)", (done) => {
            const securityService = createMockedSecurityService({
                "FR0000120271": "TTE.PA"
            });
            const sut = new DeGiroConverterV3(securityService);

            let csv = "";
            csv += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
            csv += "04-06-2024,10:00,04-06-2024,TOTALENERGIES SE,FR0000120271,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,\"-4.90\",EUR,\"500.00\",aaaaaaaa-0004-0004-0004-000000000004\n";
            csv += "04-06-2024,10:00,04-06-2024,TOTALENERGIES SE,FR0000120271,Francuski podatek od transakcji,,EUR,\"-10.09\",EUR,\"505.00\",aaaaaaaa-0004-0004-0004-000000000004\n";
            csv += "04-06-2024,10:00,04-06-2024,TOTALENERGIES SE,FR0000120271,\"Kupno 40 TotalEnergies SE@50 EUR (FR0000120271)\",,EUR,\"-2000.00\",EUR,\"515.00\",aaaaaaaa-0004-0004-0004-000000000004\n";

            sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
                expect(actualExport.activities.length).toBe(1);
                const activity = actualExport.activities[0];

                // Costs: 4.90 EUR (DEGIRO fee) + 10.09 EUR (French transaction tax) = 14.99 EUR
                // No currency conversion — activity currency is EUR
                expect(activity.quantity).toBe(40);
                expect(activity.unitPrice).toBe(50);
                expect(activity.currency).toBe("EUR");
                expect(activity.fee).toBe(14.99);

                done();
            }, (err) => {
                done(err || new Error("Should not have an error!"));
            });
        });
    });

    describe("Multi-fill order on Hong Kong Exchange: partial fills merged and all per-fill costs aggregated", () => {
        it("should produce one activity with total quantity and sum of DEGIRO fee + both stamp duty rows", (done) => {
            // Two problems were present before the fix:
            // 1. Partial fills for the same order were emitted as separate activities instead of being merged.
            // 2. DEGIRO posts one Hong Kong Stamp Duty row per fill; only the DEGIRO broker fee row was picked up,
            //    stamp duty rows were ignored, giving fee = 6.00 EUR instead of the correct 8.67 EUR.
            // After the fix: fills merged into one activity, all fee rows summed per order.
            // Wrong (before): two activities, fee = 6.00 EUR each (stamp duty missing)
            // Correct (after): one activity, fee = 8.67 EUR → 78.03 HKD at FX 9.0000
            const securityService = createMockedSecurityService({
                "CNE1000073Z4": "9973.HK"
            });
            const sut = new DeGiroConverterV3(securityService);

            let csv = "";
            csv += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
            // Fill 1: 600 shares
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Credit,9.0000,HKD,\"18000.00\",HKD,\"0.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Withdrawal,,EUR,\"-2000.00\",EUR,\"200.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,Hong Kong Stamp Duty,,EUR,\"-2.00\",EUR,\"2200.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,\"Kupno 600 Chery Automobile Co Ltd Class H@30 HKD (CNE1000073Z4)\",,HKD,\"-18000.00\",HKD,\"-24000.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            // Fill 2: 200 shares
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Credit,9.0000,HKD,\"6000.00\",HKD,\"-18000.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,FX Withdrawal,,EUR,\"-666.67\",EUR,\"2202.00\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,\"-6.00\",EUR,\"2868.67\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,Hong Kong Stamp Duty,,EUR,\"-0.67\",EUR,\"2874.67\",aaaaaaaa-0005-0005-0005-000000000005\n";
            csv += "05-06-2024,10:00,05-06-2024,CHERY AUTOMOBILE CO LTD CLASS H,CNE1000073Z4,\"Kupno 200 Chery Automobile Co Ltd Class H@30 HKD (CNE1000073Z4)\",,HKD,\"-6000.00\",HKD,\"-6000.00\",aaaaaaaa-0005-0005-0005-000000000005\n";

            sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
                expect(actualExport.activities.length).toBe(1);
                const activity = actualExport.activities[0];

                // Fills merged: 600 + 200 = 800 shares @ weighted avg 30.00 HKD
                expect(activity.quantity).toBe(800);
                expect(activity.unitPrice).toBe(30);
                expect(activity.currency).toBe("HKD");

                // Both stamp duty rows summed (one per fill) + DEGIRO broker fee — not just the broker fee alone.
                // Costs: 2.00 EUR (stamp duty fill 1) + 0.67 EUR (stamp duty fill 2) + 6.00 EUR (DEGIRO fee) = 8.67 EUR
                // Converted: 8.67 EUR * 9.0000 (FX rate EUR→HKD) = 78.03 HKD
                expect(activity.fee).toBeCloseTo(78.03, 1);


                done();
            }, (err) => {
                done(err || new Error("Should not have an error!"));
            });
        });
    });

    describe("Multi-fill SELL in USD: explicit FX rate on FX Withdrawal must be used, not a derived rate", () => {
        it("should not inflate the fee when FX Credit rows lack an explicit rate but FX Withdrawal rows have one", (done) => {
            // DEGIRO SELL orders: the explicit FX rate appears on FX Withdrawal rows, not on FX Credit rows.
            // A derived rate computed as (FX Credit EUR amount) / (trade USD amount) would pair the wrong
            // rows when there are multiple fills — e.g. pairing fill-2's FX Credit (EUR 50.00) against
            // fill-1's trade amount (USD 150.00), yielding rate 3.00 instead of 1.15 and inflating the fee
            // from the correct 3.45 USD to ~9 USD.
            // The explicit rate from FX Withdrawal (1.1500) must take priority.
            const securityService = createMockedSecurityService({
                "IE000WDG5795": "LITM.AS"
            });
            const sut = new DeGiroConverterV3(securityService);

            let csv = "";
            csv += "Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id\n";
            // Fill 1: 15 shares @ 10.00 USD
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,FX Withdrawal,\"1,1500\",USD,\"-150,00\",USD,\"0,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,FX Credit,,EUR,\"130,43\",EUR,\"200,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,\"Sprzedaż 15 iShares@10 USD (IE000WDG5795)\",,USD,\"150,00\",USD,\"150,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            // Fill 2: 5 shares @ 11.50 USD
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,FX Withdrawal,\"1,1500\",USD,\"-57,50\",USD,\"0,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,FX Credit,,EUR,\"50,00\",EUR,\"50,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,DEGIRO Opłata Transakcyjna i/lub opłata stron trzecich,,EUR,\"-3,00\",EUR,\"47,00\",aaaaaaaa-0007-0007-0007-000000000007\n";
            csv += "07-06-2024,10:00,07-06-2024,ISHARES LITHIUM,IE000WDG5795,\"Sprzedaż 5 iShares@11,50 USD (IE000WDG5795)\",,USD,\"57,50\",USD,\"57,50\",aaaaaaaa-0007-0007-0007-000000000007\n";

            sut.processFileContents(csv, (actualExport: GhostfolioExport) => {
                expect(actualExport.activities.length).toBe(1);
                const activity = actualExport.activities[0];

                // Fills merged: 15 + 5 = 20 shares
                expect(activity.quantity).toBe(20);
                expect(activity.currency).toBe("USD");
                expect(activity.type).toBe("SELL");

                // Cost: 3.00 EUR (DEGIRO fee) * 1.1500 (explicit FX rate from FX Withdrawal, EUR→USD) = 3.45 USD
                // A derived rate would produce ~9 USD here instead of 3.45 USD.
                expect(activity.fee).toBeCloseTo(3.45, 1);

                done();
            }, (err) => {
                done(err || new Error("Should not have an error!"));
            });
        });
    });

});
