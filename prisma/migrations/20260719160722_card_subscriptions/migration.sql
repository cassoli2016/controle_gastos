-- AlterTable
ALTER TABLE "CardTransaction" ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "CardSubscription" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "chargeDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardSubscription_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CardSubscription" ADD CONSTRAINT "CardSubscription_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTransaction" ADD CONSTRAINT "CardTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CardSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
