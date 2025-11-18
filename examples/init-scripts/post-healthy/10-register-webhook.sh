#!/bin/bash
set -e

echo "[Hook] Registering webhook with payment provider..."

# Hook implements own timeout for external service call
timeout 30 curl -X POST "https://payment-provider.com/api/webhooks" \
    -H "Authorization: Bearer ${PAYMENT_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${SHOP_URL}/api/webhook/payment\",\"events\":[\"payment.completed\",\"payment.failed\"]}" \
    || {
        echo "[Hook] ⚠ Webhook registration failed (timeout or error)"
        echo "[Hook] This is non-critical, continuing..."
        exit 0  # Non-fatal failure
    }

echo "[Hook] ✓ Webhook registered successfully"
