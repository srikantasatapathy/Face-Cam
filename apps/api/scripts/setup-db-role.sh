#!/usr/bin/env bash
# Gives the application its own non-owner database role.
#
# Why this exists: Postgres never applies Row Level Security to a superuser, and
# only applies it to a table's owner when FORCE is set. The app therefore has to
# connect as an ordinary role for the policies to mean anything. The superuser
# connection is kept for migrations and for platform-level queries, which
# legitimately span every tenant.
#
# Idempotent. Run after migrations, and again whenever the password changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
set -a; source "$ROOT/.env"; set +a

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${APP_DATABASE_PASSWORD:?APP_DATABASE_PASSWORD is not set}"

echo "Configuring the facecam_app role"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pw="$APP_DATABASE_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'facecam_app') THEN
    CREATE ROLE facecam_app LOGIN;
  END IF;
END
$$;

-- LOGIN is granted here rather than in a migration so the password never
-- appears in a file under version control.
ALTER ROLE facecam_app WITH LOGIN PASSWORD :'pw';

-- Deliberately NOT granted: SUPERUSER and BYPASSRLS, either of which would
-- silently switch row security off again.
ALTER ROLE facecam_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO facecam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO facecam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO facecam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO facecam_app;

-- Migration bookkeeping belongs to the owner alone.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='_prisma_migrations') THEN
    EXECUTE 'REVOKE ALL ON TABLE _prisma_migrations FROM facecam_app';
  END IF;
END
$do$;
SQL

echo "  role ready"

psql "$DATABASE_URL" -tAc "
SELECT '  facecam_app: login=' || rolcanlogin
    || ' superuser=' || rolsuper
    || ' bypassrls=' || rolbypassrls
FROM pg_roles WHERE rolname='facecam_app';"
