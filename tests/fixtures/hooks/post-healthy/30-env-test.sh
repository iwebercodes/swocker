#!/bin/bash
set -e
echo "[Test Hook] Testing environment variables"
echo "DATABASE_HOST=${DATABASE_HOST}" > /tmp/post-healthy-env-test
echo "DATABASE_NAME=${DATABASE_NAME}" >> /tmp/post-healthy-env-test
