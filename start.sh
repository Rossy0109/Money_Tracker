#!/bin/bash
PROJECT_DIR="/data/data/com.termux/files/home/Money_Tracker"

# Ensure previous processes are stopped


echo "Starting frontend server..."
cd $PROJECT_DIR/client
npm start &

echo "Application started. Access at http://localhost:3001"
