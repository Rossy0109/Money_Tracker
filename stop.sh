#!/bin/bash
echo "Stopping servers..."
pkill -f "node index.js"
pkill -f "npm start"
