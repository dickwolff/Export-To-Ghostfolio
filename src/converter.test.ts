import path from "path";
import { createAndRunConverter } from "./converter";
import { SecurityService } from "./securityService";
import YahooFinanceServiceMock from "./testing/yahooFinanceServiceMock";
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const tempRoot = path.join(tmpdir(), "converter-test");

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

describe("converter", () => {

    beforeAll(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
        jest.spyOn(console, "warn").mockImplementation(jest.fn());
    });

    beforeEach(() => {
        process.env.GHOSTFOLIO_SPLIT_OUTPUT = "";

        const inputDir = path.join(tempRoot, "in");
        const outputDir1 = path.join(tempRoot, "out", "1");
        const outputDir2 = path.join(tempRoot, "out", "2");

        mkdirSync(inputDir, { recursive: true });
        writeFileSync(path.join(inputDir, "delta-export.csv"), input);

        mkdirSync(outputDir1, { recursive: true });
        mkdirSync(outputDir2, { recursive: true });
    });

    afterEach(() => {
        rmSync(tempRoot, { recursive: true, force: true });
    });

    it("should process a file and create a result", (done) => {

        // Arrange
        const securityService = new SecurityService(new YahooFinanceServiceMock());
        const inputFile = path.join(tempRoot, "in", "delta-export.csv");
        const outputDir = path.join(tempRoot, "out", "1");

        // Act
        createAndRunConverter(
            "delta",
            inputFile,
            outputDir,
            () => {

                // Assert: there should be one file with 43 activities.
                const files = readdirSync(outputDir);
                expect(files.length).toBe(1);

                const file = files[0];
                const content = readFileSync(path.join(outputDir, file), "utf8");
                const result = JSON.parse(content);
                expect(result).toBeTruthy();
                expect(result.activities.length).toBe(43);

                done();
            },
            (e) => {
                console.log("error", e)
                done(new Error("Should not fail"));
            },
            securityService);
    });

    it("should process a file and split the result if so configured", (done) => {

        // Arrange
        process.env.GHOSTFOLIO_SPLIT_OUTPUT = "true";
        const securityService = new SecurityService(new YahooFinanceServiceMock());
        const inputFile = path.join(tempRoot, "in", "delta-export.csv");
        const outputDir = path.join(tempRoot, "out", "2");

        // Act
        createAndRunConverter(
            "delta",
            inputFile,
            outputDir,
            () => {

                // Assert: there should be two files with the first having 25 activities and the second 18 activities.
                const files = readdirSync(outputDir);
                expect(files.length).toBe(2);

                const file1 = files[0];
                const content1 = readFileSync(path.join(outputDir, file1), "utf8");
                const result1 = JSON.parse(content1);
                expect(result1).toBeTruthy();
                expect(result1.activities.length).toBe(25);

                const file2 = files[1];
                const content2 = readFileSync(path.join(outputDir, file2), "utf8");
                const result2 = JSON.parse(content2);
                expect(result2).toBeTruthy();
                expect(result2.activities.length).toBe(18);

                done();
            },
            (e) => {
                console.log("error", e)
                done(new Error("Should not fail"));
            },
            securityService);
    });
});
