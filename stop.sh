#!/bin/bash
echo "Stopping servers..."

# Terminate processes by name
pkill -f "node index.js"
pkill -f "react-scripts start"

# Forcefully kill any process on port 3001
PORT_PID=$(lsof -t -i:3001)
if [ -n "$PORT_PID" ]; then
    echo "Forcefully killing process on port 3001 (PID: $PORT_PID)"
    kill -9 $PORT_PID
    sleep 1
fi

# Clean up any lingering PID files
rm -f server.pid client.pid
