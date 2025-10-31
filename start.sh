#!/bin/bash
PROJECT_DIR="/data/data/com.termux/files/home/expense-tracker"

# Ensure previous processes are stopped
pkill -f "node index.js"
pkill -f "npm start"

echo "Starting backend server..."
cd $PROJECT_DIR/server
node index.js &

echo "Starting frontend server..."
cd $PROJECT_DIR/client
npm start &

echo "Application started. Access at http://localhost:3001"
