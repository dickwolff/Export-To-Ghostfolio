import { mkdirSync, rmSync, readdirSync} from "fs";
import { createAndRunConverter } from "./converter";

describe("converter", () => {

    beforeEach(() => {
        mkdirSync("./tmp/converter-test", { recursive: true });
    });

    beforeEach(() => {
        rmSync("./tmp/converter-test", { recursive: true, force: true});
    });

    it("should process a file and create a result", (done) => {

        // Act
        createAndRunConverter(
            "delta",
            "./samples/delta-export.csv",
            "./tmp/converter-test",
            () => {

                // Assert
                const files = readdirSync("./tmp/converter-test");
                expect(files.length).toBe(1);
            },
            (e) => {
                console.log("error", e)
                done.fail("Should not fail");
            });
    });
});
