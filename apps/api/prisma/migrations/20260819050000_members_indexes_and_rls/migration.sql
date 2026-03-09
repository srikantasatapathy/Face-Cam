-- Indexes and Row Level Security for the member tables.

-- Attributes are queried with containment (@>) when filtering by a dynamic
-- field, e.g. "all students in class 10-B". A GIN index is what makes that a
-- lookup rather than a full scan; jsonb_path_ops keeps the index smaller and
-- faster for containment specifically, which is the only operator used here.
CREATE INDEX IF NOT EXISTS members_attributes_idx
  ON "members" USING GIN (attributes jsonb_path_ops);

-- Name search is case-insensitive `contains`, which no btree index can serve.
-- pg_trgm makes it an index scan instead of a sequential one, which matters at
-- a few thousand students per tenant.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS members_full_name_trgm_idx
  ON "members" USING GIN (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS members_code_trgm_idx
  ON "members" USING GIN (code gin_trgm_ops);

-- Same two-layer isolation as the Phase 1 tables. See the row_level_security
-- migration for why these policies do not yet bind the application itself.
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_field_definitions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "members"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON "member_field_definitions"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "members" TO facecam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "member_field_definitions" TO facecam_app;
