#!/bin/bash
set -e
echo "[Test Hook] Post-healthy hook executed"
echo "POST_HEALTHY_SUCCESS" > /tmp/post-healthy-hook-status
