#!/bin/bash
set -e
echo "[Test Hook] Writing to database"
mysql -h"$DATABASE_HOST" -u"$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" <<EOF
CREATE TABLE IF NOT EXISTS hook_test (id INT, message VARCHAR(255));
INSERT INTO hook_test VALUES (1, 'Hook executed successfully');
EOF
echo "Database write complete"
