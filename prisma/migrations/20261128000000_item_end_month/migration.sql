-- AlterTable (idempotente: scripts/aplica-migration.ts roda comando a comando)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "endMonth" DATE;
