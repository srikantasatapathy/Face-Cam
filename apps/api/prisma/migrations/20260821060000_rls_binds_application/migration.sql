-- Row Level Security now binds the application itself.
--
-- The earlier row_level_security migration documented a gap: the app connected
-- as the table owner, which Postgres exempts from its own policies, so the
-- policies protected every connection EXCEPT the one that mattered.
--
-- That gap is closed, and it needed no schema change. The fix was operational:
--
--   * The app connects as `facecam_app`, a non-owner, non-superuser role.
--     Being neither, the existing ENABLE ROW LEVEL SECURITY policies apply to
--     it directly. FORCE was never needed; FORCE only matters for the owner.
--
--   * Every tenant-scoped query runs inside a transaction that first executes
--     set_config('app.tenant_id', $1, true). The `true` makes it
--     transaction-local, which is essential: connections are pooled and shared
--     between requests, so a session-level value would leak one tenant's scope
--     into the next request on that connection.
--
--   * The owner connection is kept for migrations, health checks, the tenants
--     table, and platform-level queries that must span every organization.
--     Escalating to platform scope is now a different database connection with
--     different privileges, not a boolean in application code.
--
-- The role is created and given its password by apps/api/scripts/setup-db-role.sh
-- rather than here, so no credential is committed to version control.
--
-- Proof lives in apps/api/test/rls-enforcement.e2e-spec.ts, which talks to the
-- database with the application filter removed and asserts that cross-tenant
-- reads, writes, updates and deletes are all refused anyway.
--
-- This migration only re-asserts the grants, so a database migrated before the
-- role existed ends up in the same state.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'facecam_app') THEN
    CREATE ROLE facecam_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO facecam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO facecam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO facecam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO facecam_app;

-- Migration bookkeeping stays with the owner.
--
-- Guarded because Prisma replays every migration against a throwaway shadow
-- database that has no _prisma_migrations table, and an unguarded REVOKE there
-- aborts the whole validation run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE _prisma_migrations FROM facecam_app';
  END IF;
END
$$;
