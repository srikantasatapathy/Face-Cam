-- AlterTable
ALTER TABLE "members" ADD COLUMN     "consent_withdrawn_at" TIMESTAMPTZ(6),
ADD COLUMN     "consent_withdrawn_reason" TEXT;
