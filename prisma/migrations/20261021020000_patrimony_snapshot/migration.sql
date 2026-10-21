-- CreateTable (idempotente: scripts/aplica-migration.ts roda comando a comando)
CREATE TABLE IF NOT EXISTS "PatrimonySnapshot" (
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "reserves" DECIMAL(12,2) NOT NULL,
    "portfolio" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatrimonySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatrimonySnapshot_month_key" ON "PatrimonySnapshot"("month");
