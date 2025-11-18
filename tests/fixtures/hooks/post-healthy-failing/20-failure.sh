#!/bin/bash
set -e
echo "FAILURE" >> /tmp/post-healthy-failure-test
exit 1  # Intentional failure
