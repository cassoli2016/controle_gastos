-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isTransfer" BOOLEAN NOT NULL DEFAULT false;

-- Marca as categorias de caixinha que já existem: depósito e retirada movem
-- dinheiro entre bolsos do usuário, não são ganho nem gasto. Casa por nome E
-- tipo para não pegar uma categoria homônima criada à mão.
UPDATE "Category" SET "isTransfer" = true
WHERE ("name" = 'Reserva' AND "type" = 'EXPENSE')
   OR ("name" = 'Retirada da reserva' AND "type" = 'INCOME');
