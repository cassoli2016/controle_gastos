-- CreateTable
CREATE TABLE "ReserveAdjustment" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReserveAdjustment_boxId_date_idx" ON "ReserveAdjustment"("boxId", "date");

-- AddForeignKey
ALTER TABLE "ReserveAdjustment" ADD CONSTRAINT "ReserveAdjustment_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "ReserveBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Saldo de abertura: a parte do saldo de hoje que nenhum depósito ou retirada
-- explica. Vira uma linha na data em que a caixinha foi criada, para o extrato
-- fechar de ponta a ponta em vez de começar no meio da história.
-- Inclui também os ajustes manuais feitos antes desta migration, que não
-- deixaram rastro nenhum — não há como separá-los da abertura.
INSERT INTO "ReserveAdjustment" ("id", "boxId", "date", "amount", "reason", "createdAt")
SELECT
  gen_random_uuid()::text,
  b."id",
  b."createdAt"::date,
  b."amount" - COALESCE(mov."saldo", 0),
  'Saldo de abertura',
  now()
FROM "ReserveBox" b
LEFT JOIN (
  SELECT
    "reserveBoxId",
    SUM(CASE WHEN "description" LIKE 'Depósito · %' THEN COALESCE("paidAmount", "plannedAmount") ELSE 0 END)
      - SUM(CASE WHEN "description" LIKE 'Retirada · %' THEN COALESCE("paidAmount", "plannedAmount") ELSE 0 END) AS "saldo"
  FROM "MonthlyEntry"
  WHERE "reserveBoxId" IS NOT NULL
  GROUP BY "reserveBoxId"
) mov ON mov."reserveBoxId" = b."id"
WHERE b."amount" - COALESCE(mov."saldo", 0) <> 0;
