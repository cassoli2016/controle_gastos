// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { consumeSubscriptionCharge } from "@/lib/card-subscription";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Conserta o item duplicado criado por engano ao adotar a assinatura do YouTube.
 *
 * O que aconteceu: `createCardSubscription` usa `description` para DUAS coisas —
 * chave de casamento contra a fatura e nome do Item a procurar/criar. Passei o
 * texto do banco ("Youtubepremium") esperando só a chave, e ele não achou item
 * com esse nome, então criou um item novo com 12 linhas de R$ 53,90.
 *
 * Este script: apaga o item duplicado e suas linhas, vincula a assinatura ao
 * item ORIGINAL (mantendo a descrição = texto do banco, que é o que faz o
 * consumo casar) e consome a cobrança de agosto.
 *
 * Uso: npx tsx scripts/corrige-assinatura-youtube.ts          (simula)
 *      npx tsx scripts/corrige-assinatura-youtube.ts --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");
const ORIGINAL = "YouTube Premium";
const DUPLICATE = "Youtubepremium";
const BANK_TEXT = "Youtubepremium";
const CHARGE_MONTH = "2026-08";
const CHARGE_DAY = 3;

async function main() {
  console.log(APPLY ? "MODO: gravando (--apply)\n" : "MODO: simulação — nada será gravado\n");

  const original = await prisma.item.findFirst({ where: { name: ORIGINAL }, include: { subscription: true } });
  const duplicate = await prisma.item.findFirst({
    where: { name: DUPLICATE },
    include: { subscription: true, entries: true },
  });
  if (!original) throw new Error(`item "${ORIGINAL}" não encontrado`);

  if (duplicate) {
    const total = duplicate.entries.reduce((a, e) => a + decimalToCents(String(e.plannedAmount)), 0);
    console.log(
      `APAGAR item duplicado "${duplicate.name}" · ${duplicate.entries.length} linhas · ${formatCents(total)} no total`,
    );
    console.log(`  meses: ${duplicate.entries.map((e) => monthStringFromDate(e.month)).sort().join(", ")}`);
  } else {
    console.log("item duplicado já não existe");
  }

  console.log(
    `\nVINCULAR assinatura ao item original "${original.name}" (id ${original.id})` +
      `\n  description = "${BANK_TEXT}" — é a chave contra a fatura, não o rótulo; o nome amigável fica no Item`,
  );

  const line = await prisma.monthlyEntry.findUnique({
    where: { itemId_month: { itemId: original.id, month: monthToDate(CHARGE_MONTH) } },
  });
  console.log(
    `\nLinha de ${CHARGE_MONTH}: ${line ? `${formatCents(decimalToCents(String(line.plannedAmount)))} paid=${line.paid}` : "não existe"}`,
  );

  if (!APPLY) {
    console.log("\nSimulação. Rode com --apply para gravar.");
    return;
  }

  if (duplicate) {
    if (duplicate.subscription) {
      await prisma.cardSubscription.delete({ where: { id: duplicate.subscription.id } });
    }
    await prisma.monthlyEntry.deleteMany({ where: { itemId: duplicate.id } });
    await prisma.item.delete({ where: { id: duplicate.id } });
    console.log("✓ item duplicado e suas linhas apagados");
  }

  if (!original.subscription) {
    const card = await prisma.creditCard.findFirst({
      where: { active: true, name: { contains: "nubank", mode: "insensitive" } },
    });
    if (!card) throw new Error("cartão Nubank não encontrado");
    await prisma.cardSubscription.create({
      data: {
        cardId: card.id,
        itemId: original.id,
        description: BANK_TEXT,
        amount: 53.9,
        chargeDay: CHARGE_DAY,
        months: 12,
      },
    });
    console.log("✓ assinatura vinculada ao item original");

    const txs = await prisma.cardTransaction.findMany({
      where: { cardId: card.id, month: monthToDate(CHARGE_MONTH), amount: { gt: 0 } },
      select: { description: true, amount: true, purchaseDate: true },
    });
    for (const t of txs) {
      await consumeSubscriptionCharge(
        { id: card.id },
        CHARGE_MONTH,
        t.description,
        decimalToCents(String(t.amount)),
        t.purchaseDate ? t.purchaseDate.toISOString().slice(0, 10) : undefined,
      );
    }
  }

  const after = await prisma.monthlyEntry.findUnique({
    where: { itemId_month: { itemId: original.id, month: monthToDate(CHARGE_MONTH) } },
  });
  console.log(
    `\n${CHARGE_MONTH} depois: previsto ${formatCents(decimalToCents(String(after?.plannedAmount ?? 0)))} ${after?.paid ? `pago ${formatCents(decimalToCents(String(after.paidAmount ?? 0)))}` : "em aberto"}`,
  );
  const dupLeft = await prisma.item.count({ where: { name: DUPLICATE } });
  console.log(`itens duplicados restantes: ${dupLeft}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
