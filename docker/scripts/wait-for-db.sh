#!/bin/bash
# Wait for database to be ready

set -e

# Default values
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-3306}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-}"
DB_NAME="${DATABASE_NAME:-shopware}"
MAX_RETRIES="${DB_MAX_RETRIES:-30}"
RETRY_INTERVAL="${DB_RETRY_INTERVAL:-2}"

echo "[Swocker] Waiting for database at ${DB_HOST}:${DB_PORT}..."

# Function to check if database is ready
check_db() {
    if [ -z "$DB_PASSWORD" ]; then
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "SELECT 1" > /dev/null 2>&1
    else
        MYSQL_PWD="$DB_PASSWORD" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "SELECT 1" > /dev/null 2>&1
    fi
}

# Wait for database to be ready
retries=0
until check_db; do
    retries=$((retries + 1))
    if [ $retries -ge $MAX_RETRIES ]; then
        echo "[Swocker] ERROR: Database not ready after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "[Swocker] Database not ready yet (attempt $retries/$MAX_RETRIES), waiting ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
done

echo "[Swocker] Database is ready!"

# Check if database exists, create if not
if [ -z "$DB_PASSWORD" ]; then
    DB_EXISTS=$(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "SHOW DATABASES LIKE '$DB_NAME';" | grep "$DB_NAME" || true)
else
    DB_EXISTS=$(MYSQL_PWD="$DB_PASSWORD" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "SHOW DATABASES LIKE '$DB_NAME';" | grep "$DB_NAME" || true)
fi

if [ -z "$DB_EXISTS" ]; then
    echo "[Swocker] Creating database '$DB_NAME'..."
    if [ -z "$DB_PASSWORD" ]; then
        mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    else
        MYSQL_PWD="$DB_PASSWORD" mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --connect-timeout=5 -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    fi
    echo "[Swocker] Database '$DB_NAME' created successfully"
else
    echo "[Swocker] Database '$DB_NAME' already exists"
fi
