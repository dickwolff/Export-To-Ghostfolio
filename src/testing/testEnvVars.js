const os = require("os");
const path = require("path");

const testRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

process.env.E2G_CACHE_FOLDER = path.join(os.tmpdir(), `e2g-cache-unittest-${testRunId}`);
process.env.E2G_INPUT_FOLDER = path.join(os.tmpdir(), "e2g-input");
process.env.E2G_OUTPUT_FOLDER = path.join(os.tmpdir(), "e2g-output");

process.env.ISIN_OVERRIDE_FILE = "doesnotexist.txt";

process.env.GHOSTFOLIO_ACCOUNT_ID = "aa11bb22cc33"