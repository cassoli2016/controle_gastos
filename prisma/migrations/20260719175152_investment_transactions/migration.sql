-- Negócios importados dos relatórios da B3 (dedup por hash)
CREATE TABLE "InvestmentTransaction" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "side" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "price" DECIMAL(12,4) NOT NULL,
  "value" DECIMAL(12,2) NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvestmentTransaction_hash_key" ON "InvestmentTransaction"("hash");
CREATE INDEX "InvestmentTransaction_assetId_date_idx" ON "InvestmentTransaction"("assetId", "date");
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "InvestmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
