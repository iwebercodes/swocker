#!/bin/bash
set -e

# Example: Import demo products or test data
# This demonstrates importing initial data after Shopware installation

echo "[Hook] Importing demo products..."

# Only import in development mode
if [ "$APP_ENV" != "dev" ]; then
    echo "[Hook] Skipping demo data in non-dev environment"
    exit 0
fi

# Example: Use Shopware CLI to generate demo data
if [ "$INSTALL_DEMO_DATA" = "1" ]; then
    echo "[Hook] Demo data already installed by entrypoint"
else
    # bin/console framework:demodata 2>/dev/null || echo "Demo data command not available"
    echo "[Hook] Add your custom product import logic here"
fi

echo "[Hook] ✓ Demo products imported"
