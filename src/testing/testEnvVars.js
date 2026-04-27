// Use a per-worker cache path so parallel Jest workers never share state.
process.env.E2G_CACHE_FOLDER = `/var/tmp/e2g-cache-unittest-${process.env.JEST_WORKER_ID || '0'}`;

process.env.ISIN_OVERRIDE_FILE = "doesnotexist.txt";

process.env.GHOSTFOLIO_ACCOUNT_ID = "aa11bb22cc33"