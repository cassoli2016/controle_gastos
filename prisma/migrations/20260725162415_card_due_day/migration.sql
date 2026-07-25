-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "dueDay" INTEGER;

-- Backfill dos cartões já cadastrados: Bradesco Amazon (fecha 27) e Nubank
-- (fecha 4) vencem ambos no dia 10. Em banco vazio (schema novo, schema "e2e"
-- dos testes) é no-op.
UPDATE "CreditCard" SET "dueDay" = 10 WHERE "closingDay" IS NOT NULL;
