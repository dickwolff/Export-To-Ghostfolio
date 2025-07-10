// Initialize Socket.io
const socket = io();

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Static list of converters with their display names
const converters = [
    { value: "avanza", name: "Avanza" },
    { value: "bitvavo", name: "Bitvavo" },
    { value: "bux", name: "BUX" },
    { value: "coinbase", name: "Coinbase" },
    { value: "cointracking", name: "CoinTracking" },
    { value: "degiro", name: "DEGIRO" },
    { value: "degiro-v3", name: "DEGIRO V3" },
    { value: "delta", name: "Delta" },
    { value: "directa", name: "Directa" },
    { value: "etoro", name: "eToro" },
    { value: "finpension", name: "Finpension" },
    { value: "freetrade", name: "Freetrade" },
    { value: "ibkr", name: "Interactive Brokers (IBKR)" },
    { value: "investimental", name: "Investimental" },
    { value: "parqet", name: "Parqet" },
    { value: "rabobank", name: "Rabobank" },
    { value: "revolut", name: "Revolut" },
    { value: "saxo", name: "Saxo" },
    { value: "schwab", name: "Schwab" },
    { value: "swissquote", name: "Swissquote" },
    { value: "traderepublic", name: "Trade Republic" },
    { value: "trading212", name: "Trading 212" },
    { value: "xtb", name: "XTB" }
];

// DOM elements - will be initialized when DOM is ready.
let uploadArea, fileInput, converterSelect, uploadForm, convertBtn, convertText, statusIndicator, outputContent, outputStatus, fileList;

let selectedFile = null;

// Load converters into dropdown
function loadConverters() {
    converters.forEach(converter => {
        const option = document.createElement("option");
        option.value = converter.value;
        option.textContent = converter.name;
        converterSelect.appendChild(option);
    });
}

// Auto-detect file type via API
async function detectFileType(file) {
    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/detect-file-type", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        console.log("Auto-detect result:", result);
        if (result.detectedType) {
            addLogLine(`Auto-detected: ${result.detectedType.toUpperCase()}`, "success");

            // Apply DEGIRO V3 tip if needed
            if (result.detectedType === "degiro") {
                addLogLine("Tip: If you have issues with DEGIRO, try the DEGIRO V3 converter", "info");
            }

            return result.detectedType;
        } 
        else {
            addLogLine("Could not auto-detect file type from header", "info");
            addLogLine("Please manually select the correct converter", "info");
            return null;
        }
    } catch (error) {
        addLogLine(`Detection failed: ${error.message}`, "error");
        return null;
    }
}

// Load output files
async function loadOutputFiles() {
    try {
        const response = await fetch("/api/output-files?limit=3");
        const files = await response.json();

        if (files.length === 0) {
            fileList.innerHTML = `<p class="no-files-message">No files generated yet..</p>`;
            return;
        }

        fileList.innerHTML = files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">
                        ${(file.size / 1024).toFixed(1)} KB • ${new Date(file.created).toLocaleString()}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn-download" onclick="downloadFile('${escapeHtml(file.name)}')">💾</button>
                    <button class="btn-delete" onclick="deleteFile('${escapeHtml(file.name)}')">🗑️</button>
                </div>
            </div>
        `).join("");
    } catch (error) {
        console.error("Failed to load output files:", error);
    }
}

// Download file
function downloadFile(filename) {
    const link = document.createElement("a");
    link.href = `/api/download/${encodeURIComponent(filename)}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/delete/${encodeURIComponent(filename)}`, {
            method: "DELETE"
        });
        
        const result = await response.json();
        
        if (result.success) {
            addLogLine(`Deleted file: ${filename}`, "info");
            loadOutputFiles();
        } 
        else {
            addLogLine(`Failed to delete file: ${result.error}`, "error");
        }
    } catch (error) {
        addLogLine(`Error deleting file: ${error.message}`, "error");
    }
}

// File upload handling
function initializeFileUpload() {
    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("dragover");
    });
    uploadArea.addEventListener("dragleave", () => {
        uploadArea.classList.remove("dragover");
    });
    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    selectedFile = file;
    document.querySelector(".upload-text").textContent = `${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)`;
    uploadArea.classList.add("active");

    // Clear the console output when a new file is selected.
    outputContent.innerHTML = "";

    // Auto-detect file type via API.
    detectFileType(file).then(detectedType => {
        if (detectedType) {
            converterSelect.value = detectedType;
            converterSelect.classList.add("auto-detected");
        } 
        else {
            converterSelect.classList.remove("auto-detected");
        }
        updateConvertButton();
    });
}

function updateConvertButton() {
    const canConvert = selectedFile && converterSelect.value;
    convertBtn.disabled = !canConvert;
}

// Form submission
function initializeFormSubmission() {
    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!selectedFile || !converterSelect.value) {
            return;
        }

        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("converter", converterSelect.value);
        formData.append("socketId", socket.id);

        // Update UI for processing
        convertBtn.disabled = true;
        convertText.textContent = "Processing...";
        statusIndicator.classList.add("processing");
        outputStatus.classList.add("processing");

        // Clear output
        outputContent.innerHTML = "";

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error);
            }

        } catch (error) {
            addLogLine(`Error: ${error.message}`, "error");
            statusIndicator.classList.remove("processing");
            statusIndicator.classList.add("error");
            outputStatus.classList.remove("processing");
            outputStatus.classList.add("error");
        }
    });

    converterSelect.addEventListener("change", () => {
        converterSelect.classList.remove("auto-detected");
        updateConvertButton();
    });
}

// Socket.io event handlers
function initializeSocketHandlers() {
    socket.on("log", (message) => {
        addLogLine(message);
    });

    socket.on("conversionComplete", (data) => {
        convertBtn.disabled = false;
        convertText.textContent = "Convert File";
        statusIndicator.classList.remove("processing");
        outputStatus.classList.remove("processing");

        if (data.success) {
            statusIndicator.classList.add("success");
            outputStatus.classList.add("success");
            addLogLine("Conversion completed successfully!", "success");
            loadOutputFiles(); // Refresh file list
        } 
        else {
            statusIndicator.classList.add("error");
            outputStatus.classList.add("error");
            addLogLine(`Conversion failed: ${data.error}`, "error");
        }
    });
}

function addLogLine(message, type = "info") {
    const logLine = document.createElement("div");
    logLine.className = `log-line ${type}`;
    logLine.textContent = message;
    outputContent.appendChild(logLine);
    outputContent.scrollTop = outputContent.scrollHeight;
}

// Initialize everything when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {

    // Initialize DOM elements
    uploadArea = document.getElementById("uploadArea");
    fileInput = document.getElementById("fileInput");
    converterSelect = document.getElementById("converterSelect");
    uploadForm = document.getElementById("uploadForm");
    convertBtn = document.getElementById("convertBtn");
    convertText = document.getElementById("convertText");
    statusIndicator = document.getElementById("statusIndicator");
    outputContent = document.getElementById("outputContent");
    outputStatus = document.getElementById("outputStatus");
    fileList = document.getElementById("fileList");

    // Initialize functionality
    loadConverters();
    loadOutputFiles();
    initializeFileUpload();
    initializeFormSubmission();
    initializeSocketHandlers();

    // Refresh file list every 5 seconds
    setInterval(loadOutputFiles, 5000);
});
