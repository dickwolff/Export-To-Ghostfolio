#!/bin/sh
set -e

# Export to Ghostfolio - Docker Entrypoint
# Set MODE environment variable to choose the mode:
#   - "watcher" (default): Watch for CSV files and convert them
#   - "api": Start the HTTP API server

case "${MODE}" in
  api)
    echo "[Export-To-Ghostfolio] Starting in API mode on port ${API_PORT:-8080}..."
    exec npm run start:api
    ;;
  watcher|watch|"")
    echo "[Export-To-Ghostfolio] Starting in watcher mode..."
    exec npm run watch
    ;;
  *)
    echo "[Export-To-Ghostfolio] Unknown mode: ${MODE}"
    echo "[Export-To-Ghostfolio] Valid modes: 'watcher' (default), 'api'"
    exit 1
    ;;
esac
