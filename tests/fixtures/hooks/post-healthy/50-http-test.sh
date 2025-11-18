#!/bin/bash
set -e
echo "[Test Hook] Testing HTTP accessibility"
# Test that Shopware is responding
if curl -f -s http://localhost/ > /dev/null; then
    echo "HTTP_TEST_SUCCESS" > /tmp/post-healthy-http-status
else
    echo "HTTP request failed" >&2
    exit 1
fi
