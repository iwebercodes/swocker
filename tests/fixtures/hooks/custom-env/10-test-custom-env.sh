#!/bin/bash
set -e

echo "[Test Hook] Checking custom environment variable"

if [ -z "$TEST_CUSTOM_VAR" ]; then
    echo "ERROR: TEST_CUSTOM_VAR not accessible in hook"
    exit 1
fi

echo "Custom variable value: $TEST_CUSTOM_VAR"
echo "$TEST_CUSTOM_VAR" > /var/www/html/custom-env-test.txt

echo "[Test Hook] Custom environment variable test passed"
