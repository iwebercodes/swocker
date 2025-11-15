#!/bin/bash
set -e
echo "[Test Hook] Running console command"
cd /var/www/html
bin/console about > /tmp/console-output.txt 2>&1
echo "Console command executed" > /tmp/console-check-passed
