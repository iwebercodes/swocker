#!/bin/bash
set -e

# Example: Configure Stripe payment plugin with API keys from environment variables
# Based on the example from GitHub Issue #1

echo "[Hook] Configuring Stripe plugin..."

# Validate required environment variables
if [ -z "$STRIPE_SECRET_KEY" ] || [ -z "$STRIPE_PUBLIC_KEY" ]; then
    echo "[Hook] WARNING: STRIPE_SECRET_KEY or STRIPE_PUBLIC_KEY not set, skipping Stripe configuration"
    exit 0
fi

# Activate Stripe plugin (if it exists and is installed)
# bin/console plugin:refresh
# bin/console plugin:install --activate StripePayment || echo "Plugin not found or already activated"

# Configure Stripe plugin via database
# Note: Adjust the plugin configuration keys based on your actual Stripe plugin
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
-- Configure Stripe secret key
INSERT INTO system_config (id, configuration_key, configuration_value, sales_channel_id, created_at)
VALUES (
    UNHEX(REPLACE(UUID(), '-', '')),
    'StripePayment.config.secretKey',
    JSON_OBJECT('_value', '${STRIPE_SECRET_KEY}'),
    NULL,
    NOW()
)
ON DUPLICATE KEY UPDATE configuration_value = JSON_OBJECT('_value', '${STRIPE_SECRET_KEY}');

-- Configure Stripe public key
INSERT INTO system_config (id, configuration_key, configuration_value, sales_channel_id, created_at)
VALUES (
    UNHEX(REPLACE(UUID(), '-', '')),
    'StripePayment.config.publicKey',
    JSON_OBJECT('_value', '${STRIPE_PUBLIC_KEY}'),
    NULL,
    NOW()
)
ON DUPLICATE KEY UPDATE configuration_value = JSON_OBJECT('_value', '${STRIPE_PUBLIC_KEY}');
EOF

# Verify configuration
echo "[Hook] Stripe configuration summary:"
echo "  - Secret key: $(echo $STRIPE_SECRET_KEY | sed 's/./*/g')"
echo "  - Public key: ${STRIPE_PUBLIC_KEY:0:20}..."
echo "[Hook] ✓ Stripe configuration complete"
