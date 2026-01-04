#!/bin/bash
echo "Stopping servers..."

pkill -f "npm start"
pkill -f "server.py"
