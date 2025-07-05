#!/bin/sh

# Docker startup script for Export-To-Ghostfolio
# Supports running both file watcher and web UI

echo "🚀 Starting Export-To-Ghostfolio Docker Container..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
fi

# Check if GHOSTFOLIO_ACCOUNT_ID is set
if [ -z "$GHOSTFOLIO_ACCOUNT_ID" ]; then
    echo "⚠️  WARNING: GHOSTFOLIO_ACCOUNT_ID not set!"
    echo "   Please set it via environment variable or mount a .env file"
    echo "   Example: docker run -e GHOSTFOLIO_ACCOUNT_ID=your-id ..."
fi

# Determine startup mode based on environment variable
MODE=${STARTUP_MODE:-both}

case $MODE in
    "web")
        echo "🌐 Starting Web UI only on port 3000..."
        exec npm run web
        ;;
    "watch")
        echo "👁️  Starting File Watcher only..."
        exec npm run watch
        ;;
    "both"|*)
        echo "🌐👁️  Starting both Web UI (port 3000) and File Watcher..."
        
        # Start file watcher in background
        echo "👁️  Starting File Watcher in background..."
        npm run watch &
        WATCH_PID=$!
        
        # Start web UI in foreground
        echo "🌐 Starting Web UI on port 3000..."
        npm run web &
        WEB_PID=$!
        
        # Function to handle shutdown
        shutdown() {
            echo "🛑 Shutting down services..."
            kill $WATCH_PID 2>/dev/null
            kill $WEB_PID 2>/dev/null
            exit 0
        }
        
        # Trap signals
        trap shutdown SIGTERM SIGINT
        
        # Wait for both processes
        wait $WEB_PID $WATCH_PID
        ;;
esac
