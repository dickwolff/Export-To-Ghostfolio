import fs from "fs";
import path from "path";
import sanitizeFilename from "sanitize-filename";
import dotenv from "dotenv";
import multer from "multer";
import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import * as cliProgress from "cli-progress";
import { FileTypeMatcher } from "./helpers/fileTypeMatcher";
import { createAndRunConverter } from "./converter";

dotenv.config({ quiet: true });

// Add global error handlers to prevent process exit.
process.on('uncaughtException', (error) => {
    console.error('[e] Uncaught Exception:', error);
    // Don't exit the process, just log the error.
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[e] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error.
});

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3334;
const uploadDir = "uploads";
const outputDir = process.env.E2G_OUTPUT_FOLDER || "e2g-output";

// Simple flag to ensure only one file is processed at a time
let isProcessing = false;

// Ensure directories exist.
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Configure multer for file uploads.
const storage = multer.diskStorage({
    destination: function (_, __, cb) {
        cb(null, uploadDir);
    },
    filename: function (_, file, cb) {

        // Keep original filename but add timestamp to avoid conflicts.
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (_, file, cb) => {

        // Only accept CSV files.
        if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed"));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit.
    }
});

// Set up rate limiting to prevent abuse.
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// Serve static files.
app.use(express.static("public"));

// Override console.log to send logs to connected clients.
const originalConsoleLog = console.log;
console.log = function (...args) {
    try {
        const message = args.join(" ");
        originalConsoleLog.apply(console, args);
        io.emit("log", message);
    }
    catch (loggingError) {

        // If there's an error in logging, just use original console.log.
        originalConsoleLog.apply(console, args);
        originalConsoleLog("[e] Error in log forwarding:", loggingError.message);
    }
};

// Override cli-progress MultiBar.prototype.log to also emit via socket.
const originalMultiBarLog = cliProgress.MultiBar.prototype.log;
cliProgress.MultiBar.prototype.log = function (message, ...args) {
    try {
        // Call the original log method
        const result = originalMultiBarLog.call(this, message, ...args);

        // Also emit the message via socket
        io.emit("log", message);

        return result;
    }
    catch (loggingError) {

        // If there's an error, just use original log.
        originalConsoleLog("[e] Error in progress log forwarding:", loggingError.message);
        return originalMultiBarLog.call(this, message, ...args);
    }
};

app.get("/", (_, res) => {
    res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

app.get("/files.html", (_, res) => {
    res.sendFile(path.join(process.cwd(), "public", "files.html"));
});

app.post("/api/detect-file-type", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        // Validate the uploaded file path
        const safePath = validateAndResolvePath(path.basename(req.file.path), uploadDir);
        if (!safePath) {
            res.status(403).json({ error: "Invalid file path" });
            return;
        }

        const fileContent = fs.readFileSync(safePath, "utf-8");
        const detectedType = FileTypeMatcher.detectFileType(fileContent);

        // Clean up uploaded file
        fs.unlinkSync(safePath);

        res.json({
            detectedType,
            filename: req.file.originalname
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        // Check if already processing a file.
        if (isProcessing) {
            res.status(429).json({ error: "Another file is currently being processed. Please wait and try again." });
            return;
        }

        const { converter } = req.body;
        if (!converter) {
            res.status(400).json({ error: "Converter type not specified" });
            return;
        }

        isProcessing = true;

        const inputFile = req.file.path;
        const socketId = req.body.socketId;

        // Send initial status
        if (socketId) {
            io.to(socketId).emit("log", `[i] Starting conversion with ${converter} converter...`);
            io.to(socketId).emit("log", `[i] Processing file: ${req.file.originalname}`);
        }

        // Set the INPUT_FILE environment variable for the converter
        process.env.INPUT_FILE = inputFile;

        // Run the converter
        try {
            await new Promise<void>((resolve, reject) => {
                try {
                    createAndRunConverter(
                        converter,
                        inputFile,
                        outputDir,
                        () => {
                            // Success callback
                            try {

                                if (socketId) {
                                    io.to(socketId).emit("log", "[i] Conversion completed successfully!");
                                    io.to(socketId).emit("conversionComplete", { success: true });
                                }

                                // Clean up uploaded file
                                if (fs.existsSync(inputFile)) {
                                    fs.unlinkSync(inputFile);
                                }

                                isProcessing = false;
                                resolve();
                            }
                            catch (cleanupError) {

                                console.error("Error in success callback:", cleanupError);
                                if (socketId) {
                                    io.to(socketId).emit("log", `[e] Post-processing error: ${cleanupError.message}`);
                                    io.to(socketId).emit("conversionComplete", { success: false, error: cleanupError.message });
                                }
                                isProcessing = false;
                                reject(cleanupError);
                            }
                        },
                        (error) => {

                            // Error callback
                            try {
                                const errorMessage = `[e] Conversion failed: ${error.message}`;
                                console.error("Conversion error:", error);

                                if (socketId) {
                                    io.to(socketId).emit("log", errorMessage);
                                    io.to(socketId).emit("conversionComplete", { success: false, error: error.message });
                                }

                                // Clean up uploaded file
                                if (fs.existsSync(inputFile)) {
                                    fs.unlinkSync(inputFile);
                                }

                                isProcessing = false;
                                reject(error);
                            }
                            catch (cleanupError) {

                                console.error("Error in error callback:", cleanupError);
                                if (socketId) {
                                    io.to(socketId).emit("log", `[e] Critical error during cleanup: ${cleanupError.message}`);
                                    io.to(socketId).emit("conversionComplete", { success: false, error: "Critical error occurred" });
                                }
                                isProcessing = false;
                                reject(cleanupError);
                            }
                        }
                    );
                }
                catch (syncError) {

                    // Catch any synchronous errors from createAndRunConverter
                    console.error("Synchronous error starting converter:", syncError);
                    isProcessing = false;
                    reject(syncError);
                }
            });

            // If we get here, the conversion was successful
            res.json({
                success: true,
                message: "File processed successfully",
                outputDir: outputDir
            });

        }
        catch (converterError) {
            console.error("Error during conversion process:", converterError);
            const errorMessage = `Failed during conversion: ${converterError.message}`;

            if (socketId) {
                io.to(socketId).emit("log", `[e] ${errorMessage}`);
                io.to(socketId).emit("conversionComplete", { success: false, error: converterError.message });
            }

            // Clean up uploaded file.
            if (fs.existsSync(inputFile)) {
                fs.unlinkSync(inputFile);
            }

            isProcessing = false;

            res.status(500).json({
                success: false,
                error: converterError.message
            });
        }

    } catch (error) {
        console.error("Upload error:", error);
        isProcessing = false;
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/output-files", (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string, 10) || 10;
        let files = fs.readdirSync(outputDir)
            .filter(file => file.endsWith(".json"))
            .map(file => {
                const filePath = path.join(outputDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created.getTime() - a.created.getTime());

        // If limit is -1, return all files, otherwise slice to limit
        if (limit !== -1) {
            files = files.slice(0, limit);
        }

        res.json(files);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/download/:filename", (req, res) => {
    try {
        const filename = req.params.filename;
        const safeFilePath = validateAndResolvePath(filename, outputDir);

        if (!safeFilePath) {
            res.status(403).json({ error: "Forbidden: Invalid file path" });
            return;
        }

        if (!fs.existsSync(safeFilePath)) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        res.download(safeFilePath);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/delete/:filename", (req, res) => {
    try {
        const filename = req.params.filename;
        const safeFilePath = validateAndResolvePath(filename, outputDir);

        if (!safeFilePath) {
            res.status(403).json({ error: "Forbidden: Invalid file path" });
            return;
        }

        if (!fs.existsSync(safeFilePath)) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        fs.unlinkSync(safeFilePath);
        res.json({ success: true, message: `File ${filename} deleted successfully` });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`[i] Export to Ghostfolio Web UI running on http://localhost:${PORT}`);
    console.log(`[i] Make sure to set your environment variables (GHOSTFOLIO_ACCOUNT_ID, etc.)`);
});


function validateAndResolvePath(filename: string, baseDir: string): string | null {
    try {
        const resolvedBaseDir = path.resolve(baseDir);

        // Sanitize the filename to remove potentially dangerous characters.
        const sanitizedFilename = sanitizeFilename(filename);
        if (!sanitizedFilename) {
            return null;
        }

        const proposedPath = path.resolve(baseDir, sanitizedFilename);

        // Validate that the proposed path is within the base directory.
        if (!proposedPath.startsWith(resolvedBaseDir + path.sep) && proposedPath !== resolvedBaseDir) {
            return null;
        }

        // If the file exists, validate its real path to resolve any symlinks.
        const realPath = fs.existsSync(proposedPath) ? fs.realpathSync(proposedPath) : proposedPath;
        if (!realPath.startsWith(resolvedBaseDir + path.sep) && realPath !== resolvedBaseDir) {
            return null;
        }

        return realPath;
    }
    catch (error) {
        return null;
    }
}
