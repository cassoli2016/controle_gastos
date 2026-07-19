-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "adjustAmount" DECIMAL(12,2),
ADD COLUMN     "adjustMonth" INTEGER,
ADD COLUMN     "adjustPercent" DECIMAL(5,2);
