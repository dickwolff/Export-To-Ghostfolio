import { createAndRunConverter } from "./converter";
import { SecurityService } from "./securityService";
import YahooFinanceServiceMock from "./testing/yahooFinanceServiceMock";
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "fs";

// Create sample file contents.
let input = "";
input += "Date,Way,Base amount,Base currency (name),Base type,Quote amount,Quote currency,Exchange,Sent/Received from,Sent to,Fee amount,Fee currency (name),Broker,Notes\n";
for (let idx = 0; idx < 43; idx++) {

    if (idx % 2 === 0) {
        input += "2023-05-08 15:00:00-04:00,BUY,5,AAPL,STOCK,1250,USD,Nasdaq,,,,,eToro,Example of a stock purchase\n";
    }
    else {
        input += "2023-05-08 15:00:00-04:00,DIVIDEND,,AAPL,STOCK,2.5,USD,Nasdaq,,,0.5,USD,eToro,Example of a dividend with a fee for AAPL\n";
    }
}

describe("222converter", () => {

    beforeAll(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
        jest.spyOn(console, "warn").mockImplementation(jest.fn());
    });

    beforeEach(() => {
        process.env.GHOSTFOLIO_SPLIT_OUTPUT = "";

        mkdirSync("/var/tmp/converter-test/in", { recursive: true });
        writeFileSync("/var/tmp/converter-test/in/delta-export.csv", input);

        mkdirSync("/var/tmp/converter-test/out/1", { recursive: true });
        mkdirSync("/var/tmp/converter-test/out/2", { recursive: true });
    });

    afterEach(() => {
        rmSync("/var/tmp/converter-test", { recursive: true, force: true });
    });

    it("should process a file and create a result", (done) => {

        // Arrange
        const securityService = new SecurityService(new YahooFinanceServiceMock());

        // Act
        createAndRunConverter(
            "delta",
            "/var/tmp/converter-test/in/delta-export.csv",
            "/var/tmp/converter-test/out/1",
            () => {

                // Assert: there should be one file with 43 activities.

                const files = readdirSync("/var/tmp/converter-test/out/1");
                expect(files.length).toBe(1);

                const file = files[0];
                const content = readFileSync(`/var/tmp/converter-test/out/1/${file}`, "utf8");
                const result = JSON.parse(content);
                expect(result).toBeTruthy();
                expect(result.activities.length).toBe(43);

                done();
            },
            (e) => {
                console.log("error", e)
                done.fail("Should not fail");
            },
            securityService);
    });

    it("should process a file and split the result if so configured", (done) => {

        // Arrange
        process.env.GHOSTFOLIO_SPLIT_OUTPUT = "true";
        const securityService = new SecurityService(new YahooFinanceServiceMock());

        // Act
        createAndRunConverter(
            "delta",
            "/var/tmp/converter-test/in/delta-export.csv",
            "/var/tmp/converter-test/out/2",
            () => {

                // Assert: there should be two files with the first having 25 activities and the second 18 activities.

                const files = readdirSync("/var/tmp/converter-test/out/2");
                expect(files.length).toBe(2);

                const file1 = files[0];
                const content1 = readFileSync(`/var/tmp/converter-test/out/2/${file1}`, "utf8");
                const result1 = JSON.parse(content1);
                expect(result1).toBeTruthy();
                expect(result1.activities.length).toBe(25);

                const file2 = files[1];
                const content2 = readFileSync(`/var/tmp/converter-test/out/2/${file2}`, "utf8");
                const result2 = JSON.parse(content2);
                expect(result2).toBeTruthy();
                expect(result2.activities.length).toBe(18);

                done();
            },
            (e) => {
                console.log("error", e)
                done.fail("Should not fail");
            },
            securityService);
    });
});
