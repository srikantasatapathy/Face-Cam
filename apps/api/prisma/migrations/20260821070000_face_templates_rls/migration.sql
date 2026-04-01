-- Row Level Security for face templates.
--
-- This is the most sensitive table in the product: it holds biometric
-- embeddings. It gets the same two-layer isolation as everything else, and it
-- is the reason RLS was closed out before this phase rather than after.

ALTER TABLE "face_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "face_templates"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "face_templates" TO facecam_app;

-- No ANN index yet. Recognition in Phase 3 goes through CompreFace, and these
-- embeddings are a mirror kept so the face engine stays replaceable. An HNSW
-- index is only worth building when we search them directly, and building one
-- now would cost write throughput during enrolment for no read benefit.
