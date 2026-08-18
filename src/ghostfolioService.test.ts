import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import GhostfolioService from "./ghostfolioService";

describe("ghostfolioService", () => {
    const originalUrl = process.env.GHOSTFOLIO_URL;
    const originalSecret = process.env.GHOSTFOLIO_SECRET;
    const originalValidate = process.env.GHOSTFOLIO_VALIDATE;
    const originalImport = process.env.GHOSTFOLIO_IMPORT;

    beforeEach(() => {
        process.env.GHOSTFOLIO_URL = "https://ghostfolio.example";
        process.env.GHOSTFOLIO_SECRET = "super-secret";
        process.env.GHOSTFOLIO_VALIDATE = "true";
        process.env.GHOSTFOLIO_IMPORT = "false";
        jest.restoreAllMocks();
    });

    afterEach(() => {
        if (originalUrl === undefined) delete process.env.GHOSTFOLIO_URL; else process.env.GHOSTFOLIO_URL = originalUrl;
        if (originalSecret === undefined) delete process.env.GHOSTFOLIO_SECRET; else process.env.GHOSTFOLIO_SECRET = originalSecret;
        if (originalValidate === undefined) delete process.env.GHOSTFOLIO_VALIDATE; else process.env.GHOSTFOLIO_VALIDATE = originalValidate;
        if (originalImport === undefined) delete process.env.GHOSTFOLIO_IMPORT; else process.env.GHOSTFOLIO_IMPORT = originalImport;
        jest.restoreAllMocks();
    });

    it("should validate CSV content with the Ghostfolio API using a bearer token", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ghostfolio-csv-"));
        const inputFile = path.join(tempDir, "ghostfolio-export.json");
        fs.writeFileSync(inputFile, JSON.stringify({ activities: [{ symbol: "AAPL" }] }));

        const authFetch = jest.fn().mockResolvedValue({
            json: async () => ({ authToken: "token-123" })
        }) as any;

        const validateFetch = jest.fn().mockResolvedValue({
            status: 201,
            json: async () => ({ ok: true })
        }) as any;

        global.fetch = jest.fn()
            .mockImplementationOnce(authFetch)
            .mockImplementationOnce(validateFetch);

        const sut = new GhostfolioService();
        const result = await sut.validate(inputFile);

        expect(result).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("https://ghostfolio.example/api/v1/auth/anonymous/super-secret");
        expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("https://ghostfolio.example/api/v1/import?dryRun=true");
        expect((global.fetch as jest.Mock).mock.calls[1][1]).toMatchObject({
            method: "POST",
            headers: {
                Authorization: "Bearer token-123",
                "Content-Type": "application/json"
            }
        });
    });
});
