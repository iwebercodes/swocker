#!/bin/bash
set -e
echo "[Test Hook] Checking environment variables"
if [ -z "$DATABASE_HOST" ]; then
    echo "ERROR: DATABASE_HOST not set"
    exit 1
fi
echo "Environment variables OK" > /tmp/env-check-passed
