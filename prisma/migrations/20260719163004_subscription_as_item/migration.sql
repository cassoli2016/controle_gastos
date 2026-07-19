-- Assinatura vira Item recorrente com duração escolhida
ALTER TABLE "CardSubscription" ADD COLUMN "itemId" TEXT;
ALTER TABLE "CardSubscription" ADD COLUMN "months" INTEGER NOT NULL DEFAULT 12;
CREATE UNIQUE INDEX "CardSubscription_itemId_key" ON "CardSubscription"("itemId");
ALTER TABLE "CardSubscription" ADD CONSTRAINT "CardSubscription_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
