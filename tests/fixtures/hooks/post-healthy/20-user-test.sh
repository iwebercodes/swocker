#!/bin/bash
set -e
echo "[Test Hook] Checking user context"
# Create a file to test ownership
touch /tmp/post-healthy-user-test
echo "User: $(whoami)" > /tmp/post-healthy-user-info
