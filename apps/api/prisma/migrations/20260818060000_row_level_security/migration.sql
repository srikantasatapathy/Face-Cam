-- Row Level Security for tenant-owned tables.
--
-- WHAT THIS DOES TODAY
-- --------------------
-- Policies are defined and RLS is ENABLED on every tenant-owned table. Any role
-- that is not the table owner is now constrained to a single tenant, determined
-- by the `app.tenant_id` session setting. That covers ad-hoc Adminer or psql
-- sessions, reporting credentials, and anything else that reaches this database
-- outside the application.
--
-- WHAT THIS DOES NOT DO YET
-- -------------------------
-- Postgres exempts a table's OWNER from its own policies unless FORCE ROW LEVEL
-- SECURITY is set. The application currently connects as the owner, so these
-- policies do NOT constrain the application itself. Application-side isolation
-- is enforced by the Prisma extension in src/prisma/tenant-scope.ts, which
-- refuses to query a tenant-owned table without a tenant in context.
--
-- This is stated plainly rather than papered over: right now there is ONE
-- enforced layer for application queries, not two.
--
-- HOW TO MAKE RLS BIND THE APPLICATION
-- ------------------------------------
-- FORCE cannot simply be switched on. With it enabled, every query that has not
-- set `app.tenant_id` returns zero rows, and the setting only survives inside a
-- transaction (SET LOCAL), because a pooled connection is shared between
-- requests and a session-level value would leak across tenants. Making this work
-- means routing every query through a transaction that sets the value first.
--
--   1. Give facecam_app a password and point DATABASE_URL at it.
--   2. Wrap queries so each runs as:
--        BEGIN;
--        SELECT set_config('app.tenant_id', $1, true);  -- true = transaction-local
--        ...
--        COMMIT;
--   3. ALTER TABLE ... FORCE ROW LEVEL SECURITY on each table below.
--   4. Re-run the cross-tenant isolation test with the extension disabled; it
--      must still return 404. That is the proof the backstop actually works.
--
-- Step 2 makes every query a transaction, which costs round-trips. Measure
-- before committing to it.

-- A non-owner role for the application to eventually connect as. Created
-- without LOGIN on purpose: operations grants it a password out-of-band rather
-- than having one committed to version control.
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

-- Reads the tenant for the current transaction. Returns NULL when unset, and
-- NULL never equals anything, so an unset context matches no rows. Failing
-- closed is the only acceptable default here.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Tenant-owned tables. `tenants` is absent: it is the root of the hierarchy,
-- and the super admin console must be able to list every row in it.
ALTER TABLE "tenant_branding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"      ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tenant_branding"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON "tenant_settings"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- users.tenant_id and audit_logs.tenant_id are nullable, holding super admins
-- and platform-level actions. Those rows belong to no tenant and must not be
-- visible to any tenant, so a NULL tenant_id matches no policy and stays hidden.
CREATE POLICY tenant_isolation ON "users"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON "audit_logs"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
