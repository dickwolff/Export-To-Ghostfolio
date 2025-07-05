import express from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createAndRunConverter } from './converter.js';
import { FileTypeMatcher } from './helpers/fileTypeMatcher.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const uploadDir = 'uploads';
const outputDir = process.env.E2G_OUTPUT_FOLDER || 'e2g-output';

// Ensure directories exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Keep original filename but add timestamp to avoid conflicts
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept CSV files
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Serve static files
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Override console.log to send logs to connected clients
const originalConsoleLog = console.log;
console.log = function(...args) {
    const message = args.join(' ');
    originalConsoleLog.apply(console, args);
    io.emit('log', message);
};

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.post('/api/detect-file-type', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const detectedType = FileTypeMatcher.detectFileType(fileContent);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({ 
            detectedType,
            filename: req.file.originalname 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { converter } = req.body;
        if (!converter) {
            return res.status(400).json({ error: 'Converter type not specified' });
        }

        const inputFile = req.file.path;
        const socketId = req.body.socketId;

        // Send initial status
        if (socketId) {
            io.to(socketId).emit('log', `[i] Starting conversion with ${converter} converter...`);
            io.to(socketId).emit('log', `[i] Processing file: ${req.file.originalname}`);
        }

        // Set the INPUT_FILE environment variable for the converter
        process.env.INPUT_FILE = inputFile;

        // Run the converter
        createAndRunConverter(
            converter,
            inputFile,
            outputDir,
            () => {
                // Success callback
                if (socketId) {
                    io.to(socketId).emit('log', '[i] Conversion completed successfully!');
                    io.to(socketId).emit('conversionComplete', { success: true });
                }
                
                // Clean up uploaded file
                fs.unlinkSync(inputFile);
                
                res.json({ 
                    success: true, 
                    message: 'File processed successfully',
                    outputDir: outputDir
                });
            },
            (error) => {
                // Error callback
                const errorMessage = `[e] Conversion failed: ${error.message}`;
                if (socketId) {
                    io.to(socketId).emit('log', errorMessage);
                    io.to(socketId).emit('conversionComplete', { success: false, error: error.message });
                }
                
                // Clean up uploaded file
                if (fs.existsSync(inputFile)) {
                    fs.unlinkSync(inputFile);
                }
                
                res.status(500).json({ 
                    success: false, 
                    error: error.message 
                });
            }
        );

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/output-files', (req, res) => {
    try {
        const files = fs.readdirSync(outputDir)
            .filter(file => file.endsWith('.json'))
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
        
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(outputDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.download(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`[i] Export-To-Ghostfolio Web UI running on http://localhost:${PORT}`);
    console.log(`[i] Make sure to set your environment variables (GHOSTFOLIO_ACCOUNT_ID, etc.)`);
});
