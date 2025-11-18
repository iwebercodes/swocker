#!/bin/bash
set -e
echo "[Test Hook] Testing database connectivity"
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
CREATE TABLE IF NOT EXISTS post_healthy_test (id INT, message VARCHAR(255));
INSERT INTO post_healthy_test VALUES (1, 'Post-healthy hook executed');
EOF
echo "DATABASE_TEST_SUCCESS" > /tmp/post-healthy-db-status
