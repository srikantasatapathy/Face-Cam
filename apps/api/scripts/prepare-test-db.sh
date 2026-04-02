#!/usr/bin/env bash
# Creates the e2e test database if it is missing and brings it up to date.
#
# The tests create, suspend and delete organizations, so they must never run
# against the development database. Keeping this as a script rather than a
# manual psql step means a dropped database or a fresh clone is one command
# away from working.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a

# Run from the api package so `pnpm exec prisma` resolves, no matter where the
# script was invoked from.
cd "$API_DIR"

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

# Grants are re-applied after every migrate, because a newly created table is
# not covered by grants issued before it existed.
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO facecam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO facecam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO facecam_app;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='_prisma_migrations') THEN
    EXECUTE 'REVOKE ALL ON TABLE _prisma_migrations FROM facecam_app';
  END IF;
END
$do$;
SQL

echo "  ready"
