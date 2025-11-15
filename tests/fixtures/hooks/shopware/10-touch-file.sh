#!/bin/bash
set -e
echo "[Test Hook] Shopware hook executed"
echo "SHOPWARE_HOOK_EXECUTED" > /var/www/html/hook-marker.txt
