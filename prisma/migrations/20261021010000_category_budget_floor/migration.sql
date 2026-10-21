-- AlterTable (idempotente)
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "budgetIsFloor" BOOLEAN NOT NULL DEFAULT false;
