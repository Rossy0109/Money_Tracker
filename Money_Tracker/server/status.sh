#!/bin/bash
echo "Checking application status..."

if [ -f server.pid ]; then
    SERVER_PID=$(cat server.pid)
    if ps -p $SERVER_PID > /dev/null; then
        echo "Server is running (PID: $SERVER_PID)"
    else
        echo "Server is not running, but server.pid exists."
    fi
else
    echo "Server is not running."
fi

if [ -f client.pid ]; then
    CLIENT_PID=$(cat client.pid)
    if ps -p $CLIENT_PID > /dev/null; then
        echo "Client is running (PID: $CLIENT_PID)"
    else
        echo "Client is not running, but client.pid exists."
    fi
else
    echo "Client is not running."
fi
