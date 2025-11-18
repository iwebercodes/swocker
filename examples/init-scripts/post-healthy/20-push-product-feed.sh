#!/bin/bash
set -e

echo "[Hook] Pushing product feed to marketplace..."

# Wait for Shopware to generate feed (application layer must be ready)
sleep 2

# Download feed from Shopware
curl -o /tmp/products.xml "http://localhost/feed/products.xml" \
    --retry 3 --retry-delay 2

# Push to external marketplace
curl -X POST "https://marketplace.com/api/import" \
    -H "Authorization: Bearer ${MARKETPLACE_API_KEY}" \
    -F "feed=@/tmp/products.xml" \
    --max-time 120

echo "[Hook] ✓ Product feed uploaded successfully"
