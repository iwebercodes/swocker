#!/bin/bash
set -e
echo "[Test Hook] Init hook executed"
touch /tmp/init-hook-ran
echo "SUCCESS" > /tmp/init-hook-status
