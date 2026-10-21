-- AlterTable (idempotente: scripts/aplica-migration.ts roda comando a comando)
ALTER TABLE "ReserveBox" ADD COLUMN IF NOT EXISTS "goalAmount" DECIMAL(12,2);
ALTER TABLE "ReserveBox" ADD COLUMN IF NOT EXISTS "goalMonth" DATE;
