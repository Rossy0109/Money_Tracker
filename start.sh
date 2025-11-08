#!/bin/bash
PROJECT_DIR="."

# Stop any running servers
./stop.sh

echo "Starting backend server..."
(cd $PROJECT_DIR/server && node index.js &)
sleep 2 # Give the server time to start
pgrep -f "node index.js" > server.pid

echo "Starting frontend server..."
(cd $PROJECT_DIR/client && npm start &)
sleep 5 # Give the client time to start
pgrep -f "react-scripts start" > client.pid

echo "Application started. Access at http://localhost:3001"
