-- AlterTable
ALTER TABLE "MonthlyEntry" ADD COLUMN     "cardId" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "installmentCount" INTEGER,
ADD COLUMN     "installmentId" TEXT,
ADD COLUMN     "installmentSeq" INTEGER,
ALTER COLUMN "itemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyEntry_categoryId_idx" ON "MonthlyEntry"("categoryId");

-- CreateIndex
CREATE INDEX "MonthlyEntry_cardId_idx" ON "MonthlyEntry"("cardId");

-- CreateIndex
CREATE INDEX "MonthlyEntry_installmentId_idx" ON "MonthlyEntry"("installmentId");

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
