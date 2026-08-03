#!/usr/bin/env bash
echo "Testing connection to Supabase..."
# Extract host from DATABASE_URL
HOST=$(echo $DATABASE_URL | awk -F[@:] '{print $4}')
echo "Host: $HOST"
nc -zv $HOST 5432 || echo "Connection failed via nc"
