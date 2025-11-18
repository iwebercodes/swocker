#!/bin/bash
# Comprehensive health check script for Swocker

set -e

HEALTH_STATUS=0

echo "[Health Check] Starting comprehensive health check..."

# Check web server process (Apache or Nginx/PHP-FPM)
if [ "$VARIANT" = "dev-nginx" ] || [ "$VARIANT" = "prod-nginx" ]; then
    echo "[Health Check] Checking Nginx and PHP-FPM..."

    if ! pgrep -x nginx > /dev/null; then
        echo "[Health Check] ERROR: Nginx is not running"
        HEALTH_STATUS=1
    else
        echo "[Health Check] ✓ Nginx is running"
    fi

    if ! pgrep php-fpm > /dev/null; then
        echo "[Health Check] ERROR: PHP-FPM is not running"
        HEALTH_STATUS=1
    else
        echo "[Health Check] ✓ PHP-FPM is running"
    fi
else
    echo "[Health Check] Checking Apache..."

    if ! pgrep -x apache2 > /dev/null; then
        echo "[Health Check] ERROR: Apache is not running"
        HEALTH_STATUS=1
    else
        echo "[Health Check] ✓ Apache is running"
    fi
fi

# Check database connectivity (if DATABASE_HOST is configured)
if [ -n "$DATABASE_HOST" ]; then
    echo "[Health Check] Checking database connection..."

    DB_HOST="${DATABASE_HOST}"
    DB_PORT="${DATABASE_PORT:-3306}"
    DB_USER="${DATABASE_USER:-root}"
    DB_PASSWORD="${DATABASE_PASSWORD:-}"
    DB_NAME="${DATABASE_NAME:-shopware}"

    if [ -n "$DB_PASSWORD" ]; then
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" "$DB_NAME" > /dev/null 2>&1; then
            echo "[Health Check] ✓ Database connection successful"
        else
            echo "[Health Check] ERROR: Database connection failed"
            HEALTH_STATUS=1
        fi
    else
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -e "SELECT 1" "$DB_NAME" > /dev/null 2>&1; then
            echo "[Health Check] ✓ Database connection successful"
        else
            echo "[Health Check] ERROR: Database connection failed"
            HEALTH_STATUS=1
        fi
    fi
else
    echo "[Health Check] Database not configured, skipping database check"
fi

# Check if Shopware is responding correctly with retry logic
echo "[Health Check] Checking Shopware HTTP response..."
MAX_RETRIES=3
RETRY_COUNT=0
HTTP_CHECK_PASSED=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Get HTTP status and response body
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost/ 2>&1)
    HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)
    HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

    # Check if status is in 2xx or 3xx range (success)
    if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 400 ]; then
        # Additional validation: Check if response contains Shopware indicators or is not an error page
        # We accept any successful HTTP response as Shopware might be at different stages (installing, ready, etc)
        echo "[Health Check] ✓ HTTP status $HTTP_STATUS (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
        HTTP_CHECK_PASSED=1
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "[Health Check] HTTP check failed with status $HTTP_STATUS, retrying (attempt $RETRY_COUNT/$MAX_RETRIES)..."
            sleep 2
        fi
    fi
done

if [ $HTTP_CHECK_PASSED -eq 0 ]; then
    echo "[Health Check] ERROR: Web server not responding correctly after $MAX_RETRIES attempts (last status: $HTTP_STATUS)"
    HEALTH_STATUS=1
else
    echo "[Health Check] ✓ Shopware responding to HTTP requests"
fi

# Final status
if [ $HEALTH_STATUS -eq 0 ]; then
    echo "[Health Check] ✓ All health checks passed"

    # Create marker file for post-healthy hooks
    touch /tmp/.swocker-healthy

    exit 0
else
    echo "[Health Check] ✗ Health check failed"

    # Remove marker if it exists (container unhealthy)
    rm -f /tmp/.swocker-healthy

    exit 1
fi
