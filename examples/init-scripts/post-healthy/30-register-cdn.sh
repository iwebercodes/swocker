#!/bin/bash
set -e

echo "[Hook] Registering media assets with CDN..."

# Fetch media URLs from Shopware (requires application ready)
MEDIA_URLS=$(mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" \
    -N -e "SELECT url FROM media LIMIT 100")

# Register each URL with CDN
for url in $MEDIA_URLS; do
    curl -X POST "https://cdn-provider.com/api/purge" \
        -H "API-Key: ${CDN_API_KEY}" \
        -d "{\"url\":\"${url}\"}" \
        --max-time 5 || true  # Non-fatal per-URL failure
done

echo "[Hook] ✓ CDN registration complete"
