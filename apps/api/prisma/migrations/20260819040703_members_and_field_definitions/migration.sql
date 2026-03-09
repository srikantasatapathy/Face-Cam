-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "field_type" AS ENUM ('text', 'number', 'date', 'select', 'email', 'phone', 'boolean');

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "status" "member_status" NOT NULL DEFAULT 'active',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "consent_at" TIMESTAMPTZ(6),
    "consent_version" VARCHAR(32),
    "consent_recorded_by" UUID,
    "face_enrolled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_field_definitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "type" "field_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "group" VARCHAR(64),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "help_text" VARCHAR(200),
    "max_length" INTEGER,
    "min" INTEGER,
    "max" INTEGER,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_tenant_id_status_idx" ON "members"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "members_tenant_id_full_name_idx" ON "members"("tenant_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "members_tenant_id_code_key" ON "members"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "member_field_definitions_tenant_id_sort_order_idx" ON "member_field_definitions"("tenant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "member_field_definitions_tenant_id_key_key" ON "member_field_definitions"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_field_definitions" ADD CONSTRAINT "member_field_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
