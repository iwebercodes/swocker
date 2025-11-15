#!/bin/bash
set -e

# Example: Configure a Shopware plugin using database configuration
# This script demonstrates how to set plugin configuration after installation

echo "[Hook] Configuring plugin settings..."

# Example: Configure a plugin via system_config table
# Uncomment and adapt for your plugin
# mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
# INSERT INTO system_config (id, configuration_key, configuration_value, sales_channel_id, created_at)
# VALUES (
#     UNHEX(REPLACE(UUID(), '-', '')),
#     'YourPlugin.config.someKey',
#     JSON_OBJECT('_value', 'your-value-here'),
#     NULL,
#     NOW()
# )
# ON DUPLICATE KEY UPDATE configuration_value = JSON_OBJECT('_value', 'your-value-here');
# EOF

echo "[Hook] ✓ Plugin configuration complete"
