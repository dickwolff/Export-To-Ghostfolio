import http from "http";
import { convertToGhostfolio } from "./coreConverter";
import { detectConverterType } from "./converterAutoDetect";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.API_PORT || "8080", 10);
const HOST = process.env.API_HOST || "0.0.0.0";

// Track registered routes for dynamic endpoint listing
const routes: Array<{ method: string; path: string }> = [];

function registerRoute(method: string, path: string) {
    routes.push({ method, path });
}

/**
 * Parse multipart form data manually (minimal implementation for file upload)
 */
function parseMultipartFormData(body: Buffer, boundary: string): Map<string, { filename?: string; content: Buffer | string }> {
    const result = new Map<string, { filename?: string; content: Buffer | string }>();
    const boundaryBuffer = Buffer.from(`--${boundary}`);

    // Split by boundary
    let start = 0;
    let boundaryIndex = body.indexOf(boundaryBuffer, start);

    while (boundaryIndex !== -1) {
        const nextBoundaryIndex = body.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
        if (nextBoundaryIndex === -1) break;

        // Extract part between boundaries
        const partStart = boundaryIndex + boundaryBuffer.length + 2; // +2 for \r\n
        const partEnd = nextBoundaryIndex - 2; // -2 for \r\n before boundary

        if (partStart >= partEnd) {
            boundaryIndex = nextBoundaryIndex;
            continue;
        }

        const part = body.slice(partStart, partEnd);

        // Find header/content separator
        const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
        if (headerEnd === -1) {
            boundaryIndex = nextBoundaryIndex;
            continue;
        }

        const headerPart = part.slice(0, headerEnd).toString();
        const contentPart = part.slice(headerEnd + 4);

        // Parse Content-Disposition header
        const dispositionMatch = headerPart.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
        if (dispositionMatch) {
            const fieldName = dispositionMatch[1];
            const filename = dispositionMatch[2];

            if (filename) {
                result.set(fieldName, { filename, content: contentPart });
            } else {
                result.set(fieldName, { content: contentPart.toString().trim() });
            }
        }

        boundaryIndex = nextBoundaryIndex;
    }

    return result;
}

/**
 * Validate UUID format
 */
function isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

/**
 * Send JSON response
 */
function sendJsonResponse(res: http.ServerResponse, statusCode: number, data: object) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

/**
 * Send file download response
 */
function sendFileResponse(res: http.ServerResponse, filename: string, data: object) {
    const jsonContent = JSON.stringify(data, null, 2);
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": Buffer.byteLength(jsonContent)
    });
    res.end(jsonContent);
}

/**
 * Read request body as Buffer
 */
function readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

/**
 * Handle health check endpoint
 */
function handleHealth(res: http.ServerResponse) {
    sendJsonResponse(res, 200, { ok: true });
}

/**
 * Handle convert endpoint
 */
async function handleConvert(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        // Check content type
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
            sendJsonResponse(res, 400, {
                error: "Invalid content type",
                message: "Expected multipart/form-data"
            });
            return;
        }

        // Extract boundary
        const boundaryMatch = contentType.match(/boundary=([^;]+)/);
        if (!boundaryMatch) {
            sendJsonResponse(res, 400, {
                error: "Invalid request",
                message: "Missing multipart boundary"
            });
            return;
        }
        const boundary = boundaryMatch[1];

        // Read and parse body
        const body = await readBody(req);
        const formData = parseMultipartFormData(body, boundary);

        // Validate required fields
        const fileField = formData.get("file");
        const accountIdField = formData.get("accountId");

        if (!fileField || !fileField.filename) {
            sendJsonResponse(res, 400, {
                error: "Missing file",
                message: "A CSV file must be uploaded in the 'file' field"
            });
            return;
        }

        if (!accountIdField) {
            sendJsonResponse(res, 400, {
                error: "Missing accountId",
                message: "The 'accountId' field is required (Ghostfolio account UUID)"
            });
            return;
        }

        const accountId = accountIdField.content as string;
        if (!isValidUUID(accountId)) {
            sendJsonResponse(res, 400, {
                error: "Invalid accountId",
                message: "The 'accountId' must be a valid UUID"
            });
            return;
        }

        // Get CSV content
        const csvContent = fileField.content.toString();

        // Auto-detect converter type from CSV header
        const converterType = detectConverterType(csvContent);
        if (!converterType) {
            sendJsonResponse(res, 400, {
                error: "Unable to detect file format",
                message: "Could not auto-detect the file format from the CSV header."
            });
            return;
        }

        console.log(`[i] Auto-detected converter type: ${converterType}`);
        console.log(`[i] Converting file using ${converterType} converter for account ${accountId}`);

        // Perform conversion
        const result = await convertToGhostfolio(converterType, csvContent, {
            accountId: accountId
        });

        // For API, we always return a single combined result (not split)
        // If there are multiple exports due to splitting, combine them
        if (result.exports.length === 1) {
            const filename = `ghostfolio-${converterType}-${Date.now()}.json`;
            sendFileResponse(res, filename, result.exports[0]);
        } else {
            // Combine all activities into one export
            const combinedExport = {
                ...result.exports[0],
                activities: result.exports.flatMap(e => e.activities)
            };
            const filename = `ghostfolio-${converterType}-${Date.now()}.json`;
            sendFileResponse(res, filename, combinedExport);
        }

        console.log(`[i] Successfully converted ${result.totalActivities} activities`);

    } catch (error) {
        console.error("[API] Conversion error:", error);
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        sendJsonResponse(res, 500, {
            error: "Conversion failed",
            message: message
        });
    }
}

/**
 * Main request handler
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url || "/";
    const method = req.method || "GET";

    console.log(`[i] ${method} ${url}`);

    // CORS headers for browser compatibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        if (method === "GET" && url === "/health") {
            handleHealth(res);
        } else if (method === "POST" && url === "/convert") {
            await handleConvert(req, res);
        } else {
            const availableRoutes = routes.map(r => `${r.method} ${r.path}`).join(", ");
            sendJsonResponse(res, 404, {
                error: "Not found",
                message: `Route ${method} ${url} not found. Available endpoints: ${availableRoutes}`
            });
        }
    } catch (error) {
        console.error("[API] Unhandled error:", error);
        sendJsonResponse(res, 500, {
            error: "Internal server error",
            message: "An unexpected error occurred"
        });
    }
}

// Register routes
registerRoute("GET", "/health");
registerRoute("POST", "/convert");

/**
 * Create the HTTP server (exported for testing)
 */
function createServer() {
    return http.createServer(handleRequest);
}

/**
 * Start the API server
 */
function startServer() {
    const server = createServer();

    server.listen(PORT, HOST, () => {
        console.log(`[i] Export-To-Ghostfolio API server running at http://${HOST}:${PORT}`);
        console.log(`[i] Endpoints:`);
        routes.forEach(route => {
            console.log(`[i]   ${route.method.padEnd(5)} ${route.path}`);
        });
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
        console.log("[i] Received SIGTERM, shutting down...");
        server.close(() => {
            console.log("[i] Server closed");
            process.exit(0);
        });
    });

    process.on("SIGINT", () => {
        console.log("[i] Received SIGINT, shutting down...");
        server.close(() => {
            console.log("[i] Server closed");
            process.exit(0);
        });
    });

    return server;
}

// Export for testing
export { createServer, handleRequest, isValidUUID, parseMultipartFormData };

// Only start the server if this file is run directly (not imported)
if (process.argv[1]?.endsWith("api.ts") || process.argv[1]?.endsWith("api.js")) {
    startServer();
}

