-- Módulo de investimentos: posições (ações) + dividendos
CREATE TABLE "InvestmentAsset" (
  "id" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "name" TEXT,
  "segment" TEXT,
  "class" TEXT NOT NULL DEFAULT 'STOCK',
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "avgPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "lastPrice" DECIMAL(12,4),
  "priceAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestmentAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvestmentAsset_ticker_key" ON "InvestmentAsset"("ticker");

CREATE TABLE "Dividend" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "exDate" DATE,
  "payDate" DATE NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitValue" DECIMAL(12,6) NOT NULL,
  "gross" DECIMAL(12,2) NOT NULL,
  "net" DECIMAL(12,2) NOT NULL,
  "received" BOOLEAN NOT NULL DEFAULT false,
  "entryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Dividend_assetId_payDate_idx" ON "Dividend"("assetId", "payDate");
CREATE INDEX "Dividend_received_payDate_idx" ON "Dividend"("received", "payDate");
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "InvestmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
