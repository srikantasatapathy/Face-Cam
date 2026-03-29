-- DropIndex
DROP INDEX "members_attributes_idx";

-- DropIndex
DROP INDEX "members_code_trgm_idx";

-- DropIndex
DROP INDEX "members_full_name_trgm_idx";

-- CreateTable
CREATE TABLE "face_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "compreface_image_id" VARCHAR(100),
    "compreface_subject" VARCHAR(200),
    "embedding" vector(512),
    "image_ref" TEXT,
    "detection_score" DOUBLE PRECISION,
    "spoof_score" DOUBLE PRECISION,
    "enrolled_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "face_templates_tenant_id_member_id_idx" ON "face_templates"("tenant_id", "member_id");

-- AddForeignKey
ALTER TABLE "face_templates" ADD CONSTRAINT "face_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_templates" ADD CONSTRAINT "face_templates_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
