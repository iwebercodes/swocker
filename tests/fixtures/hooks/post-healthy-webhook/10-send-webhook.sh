#!/bin/bash
set -e

echo "[Test Hook] Sending webhook to external service..."

# Send webhook with shop information
curl -X POST "http://webhook-receiver/test-session-swocker" \
  -H "Content-Type: application/json" \
  -H "X-Shopware-Shop-Signature: test-signature" \
  -d '{
    "event": "shop.ready",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "data": {
      "shop_url": "'"${APP_URL:-http://localhost}"'",
      "database": "'"${DATABASE_NAME:-shopware}"'",
      "message": "Shopware is fully ready and can serve HTTP requests"
    }
  }' \
  --max-time 30 \
  --retry 3 \
  --retry-delay 2

echo "[Test Hook] ✓ Webhook sent successfully"
echo "WEBHOOK_SENT" > /tmp/post-healthy-webhook-status
