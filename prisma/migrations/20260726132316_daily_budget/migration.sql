-- CreateTable
CREATE TABLE "DailyBudget" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "amountPerDay" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBudget_pkey" PRIMARY KEY ("id")
);

-- Valor informado pelo usuário: R$ 100,00 por dia. Vai como dado (não como
-- constante no código) para ele poder mudar pela tela sem deploy.
INSERT INTO "DailyBudget" ("id", "amountPerDay", "updatedAt")
VALUES ('default', 100, NOW())
ON CONFLICT ("id") DO NOTHING;
