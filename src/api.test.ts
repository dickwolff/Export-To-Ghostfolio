import http from "http";
import { createServer, isValidUUID, parseMultipartFormData } from "./api";
import { detectConverterType } from "./converterAutoDetect";
import * as coreConverter from "./coreConverter";
import { GhostfolioOrderType } from "./models/ghostfolioOrderType";

// Helper function to make HTTP requests to the test server
function makeRequest(
    server: http.Server,
    options: {
        method: string;
        path: string;
        headers?: Record<string, string>;
        body?: Buffer | string;
    }
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
        const address = server.address();
        if (!address || typeof address === "string") {
            return reject(new Error("Server not started"));
        }

        const req = http.request(
            {
                hostname: "127.0.0.1",
                port: address.port,
                path: options.path,
                method: options.method,
                headers: options.headers
            },
            (res) => {
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    resolve({
                        statusCode: res.statusCode || 500,
                        headers: res.headers,
                        body
                    });
                });
            }
        );

        req.on("error", reject);

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// Helper to create multipart form data
function createMultipartFormData(
    fields: Array<{ name: string; value: string; filename?: string }>
): { body: Buffer; boundary: string } {
    const boundary = "----TestBoundary" + Date.now();
    const parts: Buffer[] = [];

    for (const field of fields) {
        let header = `--${boundary}\r\n`;
        if (field.filename) {
            header += `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`;
            header += `Content-Type: text/csv\r\n`;
        } else {
            header += `Content-Disposition: form-data; name="${field.name}"\r\n`;
        }
        header += "\r\n";

        parts.push(Buffer.from(header));
        parts.push(Buffer.from(field.value));
        parts.push(Buffer.from("\r\n"));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
        body: Buffer.concat(parts),
        boundary
    };
}

describe("API", () => {
    let server: http.Server;

    beforeAll(() => {
        jest.spyOn(console, "log").mockImplementation(jest.fn());
        jest.spyOn(console, "error").mockImplementation(jest.fn());
    });

    beforeEach((done) => {
        server = createServer();
        server.listen(0, "127.0.0.1", done); // Use port 0 to get a random available port
    });

    afterEach((done) => {
        server.close(done);
    });

    describe("GET /health", () => {
        it("should return ok: true", async () => {
            const response = await makeRequest(server, {
                method: "GET",
                path: "/health"
            });

            expect(response.statusCode).toBe(200);
            expect(response.headers["content-type"]).toBe("application/json");
            expect(JSON.parse(response.body)).toEqual({ ok: true });
        });
    });

    describe("GET /unknown", () => {
        it("should return 404 for unknown routes", async () => {
            const response = await makeRequest(server, {
                method: "GET",
                path: "/unknown"
            });

            expect(response.statusCode).toBe(404);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Not found");
        });
    });

    describe("OPTIONS request", () => {
        it("should return 204 with CORS headers", async () => {
            const response = await makeRequest(server, {
                method: "OPTIONS",
                path: "/convert"
            });

            expect(response.statusCode).toBe(204);
            expect(response.headers["access-control-allow-origin"]).toBe("*");
            expect(response.headers["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
        });
    });

    describe("POST /convert", () => {
        it("should return 400 if content-type is not multipart/form-data", async () => {
            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Invalid content type");
        });

        it("should return 400 if file is missing", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Missing file");
        });

        it("should return 400 if accountId is missing", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "file", value: "header1,header2\nvalue1,value2", filename: "test.csv" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Missing accountId");
        });

        it("should return 400 if accountId is not a valid UUID", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "file", value: "header1,header2\nvalue1,value2", filename: "test.csv" },
                { name: "accountId", value: "not-a-uuid" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Invalid accountId");
        });

        it("should return 400 if tagIds contains invalid UUID", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "file", value: "header1,header2\nvalue1,value2", filename: "test.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" },
                { name: "tagIds", value: "not-a-uuid" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Invalid tagIds");
        });

        it("should return 400 if tagIds contains mix of valid and invalid UUIDs", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "file", value: "header1,header2\nvalue1,value2", filename: "test.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" },
                { name: "tagIds", value: "12345678-1234-1234-1234-123456789012, invalid-uuid" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Invalid tagIds");
        });

        it("should return 400 if converter cannot be auto-detected", async () => {
            const { body, boundary } = createMultipartFormData([
                { name: "file", value: "", filename: "test.csv" },  // Empty file - can't detect
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(400);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Unable to detect file format");
        });

        it("should successfully convert a valid CSV file", async () => {
            // Mock the conversion function
            const mockResult = {
                exports: [
                    {
                        meta: { date: new Date(), version: "1.0.0" },
                        activities: [
                            {
                                accountId: "12345678-1234-1234-1234-123456789012",
                                comment: "",
                                fee: 0,
                                quantity: 10,
                                type: GhostfolioOrderType.buy,
                                unitPrice: 100,
                                currency: "USD",
                                dataSource: "YAHOO",
                                date: "2024-01-01",
                                symbol: "AAPL",
                                tags: []
                            }
                        ],
                        updateCashBalance: false
                    }
                ],
                totalActivities: 1
            };

            jest.spyOn(coreConverter, "convertToGhostfolio").mockResolvedValueOnce(mockResult);

            const csvContent = "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee\n" +
                "Market buy,2024-01-01 10:00:00,US0378331005,AAPL,Apple Inc.,10,100,USD,1,,,1000,USD,,,Test,123,";

            const { body, boundary } = createMultipartFormData([
                { name: "file", value: csvContent, filename: "trading212-export.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(200);
            expect(response.headers["content-type"]).toBe("application/json");
            expect(response.headers["content-disposition"]).toMatch(/attachment; filename="ghostfolio-trading212-\d+\.json"/);

            const data = JSON.parse(response.body);
            expect(data.activities).toBeDefined();
            expect(data.activities.length).toBe(1);
        });

        it("should successfully convert with valid tag IDs", async () => {
            // Mock the conversion function
            const mockResult = {
                exports: [
                    {
                        meta: { date: new Date(), version: "1.0.0" },
                        activities: [
                            {
                                accountId: "12345678-1234-1234-1234-123456789012",
                                comment: "",
                                fee: 0,
                                quantity: 10,
                                type: GhostfolioOrderType.buy,
                                unitPrice: 100,
                                currency: "USD",
                                dataSource: "YAHOO",
                                date: "2024-01-01",
                                symbol: "AAPL",
                                tags: ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]
                            }
                        ],
                        updateCashBalance: false
                    }
                ],
                totalActivities: 1
            };

            const convertSpy = jest.spyOn(coreConverter, "convertToGhostfolio").mockResolvedValueOnce(mockResult);

            const csvContent = "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee\n" +
                "Market buy,2024-01-01 10:00:00,US0378331005,AAPL,Apple Inc.,10,100,USD,1,,,1000,USD,,,Test,123,";

            const { body, boundary } = createMultipartFormData([
                { name: "file", value: csvContent, filename: "trading212-export.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" },
                { name: "tagIds", value: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(200);
            expect(convertSpy).toHaveBeenCalledWith(
                "trading212",
                expect.any(String),
                expect.objectContaining({
                    accountId: "12345678-1234-1234-1234-123456789012",
                    tagIds: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                })
            );
        });

        it("should accept multiple comma-separated tag IDs", async () => {
            const mockResult = {
                exports: [
                    {
                        meta: { date: new Date(), version: "1.0.0" },
                        activities: [],
                        updateCashBalance: false
                    }
                ],
                totalActivities: 0
            };

            const convertSpy = jest.spyOn(coreConverter, "convertToGhostfolio").mockResolvedValueOnce(mockResult);

            const csvContent = "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee\n";

            const { body, boundary } = createMultipartFormData([
                { name: "file", value: csvContent, filename: "trading212-export.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" },
                { name: "tagIds", value: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, 11111111-2222-3333-4444-555555555555" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(200);
            expect(convertSpy).toHaveBeenCalledWith(
                "trading212",
                expect.any(String),
                expect.objectContaining({
                    tagIds: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, 11111111-2222-3333-4444-555555555555"
                })
            );
        });

        it("should return 500 if conversion fails", async () => {
            // Use a valid trading212 header so detection succeeds
            const csvContent = "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee\n" +
                "invalid data";

            jest.spyOn(coreConverter, "convertToGhostfolio").mockRejectedValueOnce(
                new Error("Conversion failed: invalid CSV format")
            );

            const { body, boundary } = createMultipartFormData([
                { name: "file", value: csvContent, filename: "test.csv" },
                { name: "accountId", value: "12345678-1234-1234-1234-123456789012" }
            ]);

            const response = await makeRequest(server, {
                method: "POST",
                path: "/convert",
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${boundary}`
                },
                body
            });

            expect(response.statusCode).toBe(500);
            const data = JSON.parse(response.body);
            expect(data.error).toBe("Conversion failed");
        });
    });

    describe("CORS headers", () => {
        it("should include CORS headers on all responses", async () => {
            const response = await makeRequest(server, {
                method: "GET",
                path: "/health"
            });

            expect(response.headers["access-control-allow-origin"]).toBe("*");
            expect(response.headers["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
            expect(response.headers["access-control-allow-headers"]).toBe("Content-Type");
        });
    });
});

describe("isValidUUID", () => {
    it("should return true for valid UUIDs", () => {
        expect(isValidUUID("12345678-1234-1234-1234-123456789012")).toBe(true);
        expect(isValidUUID("a1b2c3d4-e5f6-1234-a1b2-c3d4e5f6a1b2")).toBe(true);
        expect(isValidUUID("A1B2C3D4-E5F6-1234-A1B2-C3D4E5F6A1B2")).toBe(true);
        expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true); // UUID v4
    });

    it("should return false for invalid UUIDs", () => {
        expect(isValidUUID("not-a-uuid")).toBe(false);
        expect(isValidUUID("12345678-1234-1234-1234-12345678901")).toBe(false); // too short
        expect(isValidUUID("12345678-1234-1234-1234-1234567890123")).toBe(false); // too long
        expect(isValidUUID("12345678123412341234123456789012")).toBe(false); // no dashes
        expect(isValidUUID("")).toBe(false);
        expect(isValidUUID("gggggggg-gggg-gggg-gggg-gggggggggggg")).toBe(false); // invalid hex
    });
});

describe("parseMultipartFormData", () => {
    it("should parse simple form fields", () => {
        const boundary = "----TestBoundary";
        const body = Buffer.from(
            `------TestBoundary\r\n` +
            `Content-Disposition: form-data; name="field1"\r\n\r\n` +
            `value1\r\n` +
            `------TestBoundary\r\n` +
            `Content-Disposition: form-data; name="field2"\r\n\r\n` +
            `value2\r\n` +
            `------TestBoundary--\r\n`
        );

        const result = parseMultipartFormData(body, boundary);

        expect(result.get("field1")?.content).toBe("value1");
        expect(result.get("field2")?.content).toBe("value2");
    });

    it("should parse file uploads", () => {
        const boundary = "----TestBoundary";
        const body = Buffer.from(
            `------TestBoundary\r\n` +
            `Content-Disposition: form-data; name="file"; filename="test.csv"\r\n` +
            `Content-Type: text/csv\r\n\r\n` +
            `header1,header2\nvalue1,value2\r\n` +
            `------TestBoundary--\r\n`
        );

        const result = parseMultipartFormData(body, boundary);

        expect(result.get("file")?.filename).toBe("test.csv");
        expect(result.get("file")?.content.toString()).toBe("header1,header2\nvalue1,value2");
    });

    it("should handle mixed form fields and files", () => {
        const boundary = "----TestBoundary";
        const body = Buffer.from(
            `------TestBoundary\r\n` +
            `Content-Disposition: form-data; name="accountId"\r\n\r\n` +
            `12345678-1234-1234-1234-123456789012\r\n` +
            `------TestBoundary\r\n` +
            `Content-Disposition: form-data; name="file"; filename="export.csv"\r\n` +
            `Content-Type: text/csv\r\n\r\n` +
            `data\r\n` +
            `------TestBoundary--\r\n`
        );

        const result = parseMultipartFormData(body, boundary);

        expect(result.get("accountId")?.content).toBe("12345678-1234-1234-1234-123456789012");
        expect(result.get("file")?.filename).toBe("export.csv");
    });

    it("should handle empty body", () => {
        const boundary = "----TestBoundary";
        const body = Buffer.from(`------TestBoundary--\r\n`);

        const result = parseMultipartFormData(body, boundary);

        expect(result.size).toBe(0);
    });
});

describe("detectConverterType", () => {
    it("should detect trading212 from header", () => {
        const csv = "Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Notes,ID,Currency conversion fee\nMarket buy,2024-01-01,US123,AAPL,Apple,10,100,USD,1,,,1000,USD,,,Test,123,";
        expect(detectConverterType(csv)).toBe("trading212");
    });

    it("should detect degiro from header", () => {
        const csv = "Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id\n01-01-2024,10:00,01-01-2024,Apple,US123,Buy,,100,,100,,123";
        expect(detectConverterType(csv)).toBe("degiro");
    });

    it("should detect schwab from header", () => {
        const csv = "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n01/01/2024,Buy,AAPL,Apple Inc,10,100,0,1000";
        expect(detectConverterType(csv)).toBe("schwab");
    });

    it("should detect ibkr from header", () => {
        const csv = '"Buy/Sell","TradeDate","ISIN","Quantity","TradePrice","TradeMoney","CurrencyPrimary","IBCommission","IBCommissionCurrency"\n"BUY","2024-01-01","US123","10","100","1000","USD","1","USD"';
        expect(detectConverterType(csv)).toBe("ibkr");
    });

    it("should detect swissquote from header", () => {
        const csv = "Date;Order #;Transaction;Symbol;Name;ISIN;Quantity;Unit price;Costs;Accrued Interest;Net Amount;Balance;Currency\n2024-01-01;123;Buy;AAPL;Apple;US123;10;100;0;0;1000;1000;USD";
        expect(detectConverterType(csv)).toBe("swissquote");
    });

    it("should return null for empty content", () => {
        expect(detectConverterType("")).toBeNull();
        expect(detectConverterType("   ")).toBeNull();
        expect(detectConverterType("\n\n")).toBeNull();
    });
});

