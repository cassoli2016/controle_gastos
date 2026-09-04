-- AlterTable
ALTER TABLE "MonthlyEntry" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reserveBoxId" TEXT,
ADD COLUMN     "withdrawalForId" TEXT;

-- CreateIndex
CREATE INDEX "MonthlyEntry_withdrawalForId_idx" ON "MonthlyEntry"("withdrawalForId");

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_reserveBoxId_fkey" FOREIGN KEY ("reserveBoxId") REFERENCES "ReserveBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Liga os movimentos de caixinha que já existem à sua caixinha, pelo nome que
-- ficou gravado na descrição ("Depósito · X" / "Retirada · X"). Nome duplicado
-- não existe hoje; se existisse, o LIMIT 1 deixaria o vínculo para o backfill
-- manual em vez de escolher errado com confiança.
UPDATE "MonthlyEntry" e
SET "reserveBoxId" = b.id
FROM "ReserveBox" b
WHERE e."reserveBoxId" IS NULL
  AND (e.description = 'Depósito · ' || b.name OR e.description = 'Retirada · ' || b.name);

-- Liga cada retirada à conta que ela pagou: mesma competência, mesma data de
-- pagamento e mesmo valor. Só vincula quando o candidato é ÚNICO — retirada
-- ambígua fica sem vínculo, e desmarcar a baixa vai apenas avisar.
UPDATE "MonthlyEntry" w
SET "withdrawalForId" = (
  SELECT c.id FROM "MonthlyEntry" c
  WHERE c.id <> w.id
    AND c.paid = true
    AND c.month = w.month
    AND c."paidDate" = w."paidDate"
    AND c."paidAmount" = w."paidAmount"
    AND c.description IS DISTINCT FROM w.description
    AND c."categoryId" <> w."categoryId"
  LIMIT 1
)
WHERE w.description LIKE 'Retirada · %'
  AND w."withdrawalForId" IS NULL
  AND (
    SELECT count(*) FROM "MonthlyEntry" c
    WHERE c.id <> w.id
      AND c.paid = true
      AND c.month = w.month
      AND c."paidDate" = w."paidDate"
      AND c."paidAmount" = w."paidAmount"
      AND c.description IS DISTINCT FROM w.description
      AND c."categoryId" <> w."categoryId"
  ) = 1;
