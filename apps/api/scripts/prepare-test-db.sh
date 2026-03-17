#!/usr/bin/env bash
# Creates the e2e test database if it is missing and brings it up to date.
#
# The tests create, suspend and delete organizations, so they must never run
# against the development database. Keeping this as a script rather than a
# manual psql step means a dropped database or a fresh clone is one command
# away from working.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
set -a; source "$ROOT/.env"; set +a

TEST_DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL%/*}/facecam_test_db}"
TEST_DB_NAME="${TEST_DATABASE_URL##*/}"
ADMIN_URL="${TEST_DATABASE_URL%/*}/postgres"

echo "Preparing $TEST_DB_NAME"

# CREATE DATABASE cannot run inside a transaction and has no IF NOT EXISTS,
# so existence is checked first.
if ! psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB_NAME'" | grep -q 1; then
  psql "$ADMIN_URL" -c "CREATE DATABASE $TEST_DB_NAME"
  echo "  created"
else
  echo "  already exists"
fi

DATABASE_URL="$TEST_DATABASE_URL" pnpm exec prisma migrate deploy
echo "  ready"
