// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { createCardSubscription, consumeSubscriptionCharge } from "@/lib/card-subscription";
import { descriptionsMatch } from "@/lib/description-match";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { decimalToCents, formatCents } from "@/lib/money";

/**
 * HBO Max vira assinatura do Nubank (pedido de 2026-11-21). Era só conta fixa
 * (Item "HBO Max", R$ 4,90, dia 15) e a mesma cobrança vinha dentro de toda
 * fatura ("Assinatura HBO Max desconto Nubank") — contava duas vezes.
 *
 * - cria a assinatura ADOTANDO o item (as linhas até 2029 ficam);
 * - etiqueta as cobranças já importadas (elas saem do ritmo de gasto à vista
 *   da tendência, porque a linha fixa já as cobra);
 * - consome a linha do mês só onde ela está em aberto. Linha já baixada à mão
 *   (ago–nov/2026) NÃO é mexida: são meses fechados e a decisão é do usuário.
 *
 * Idempotente: na segunda execução a assinatura já existe e as etiquetas já
 * estão postas.
 *
 *   npx tsx scripts/adota-hbo-max.ts            # simulação
 *   npx tsx scripts/adota-hbo-max.ts --apply    # grava
 */
const APPLY = process.argv.includes("--apply");
const NAME = "HBO Max";
const BANK_TEXT = "HBO Max";
const CHARGE_DAY = 15;

async function main() {
  const item = await prisma.item.findFirst({
    where: { active: true, name: { equals: NAME, mode: "insensitive" } },
    include: { subscription: true },
  });
  if (!item) throw new Error(`Item "${NAME}" não encontrado.`);
  const card = await prisma.creditCard.findFirst({ where: { active: true, name: { contains: "Nubank", mode: "insensitive" } } });
  if (!card) throw new Error("Cartão Nubank não encontrado.");
  const last = await prisma.monthlyEntry.findFirst({ where: { itemId: item.id }, orderBy: { month: "desc" } });
  const amountCents = last ? decimalToCents(String(last.plannedAmount)) : 0;
  console.log(`${NAME}: ${formatCents(amountCents)} · ${card.name} · dia ${CHARGE_DAY} · assinatura ${item.subscription?.active ? "JÁ EXISTE" : "será criada"}`);

  const charges = (await prisma.cardTransaction.findMany({ where: { cardId: card.id, amount: { gt: 0 } }, orderBy: { month: "asc" } })).filter(
    (t) => descriptionsMatch(BANK_TEXT, t.bankDescription ?? t.description),
  );
  for (const t of charges) {
    const month = monthStringFromDate(t.month);
    const line = await prisma.monthlyEntry.findUnique({ where: { itemId_month: { itemId: item.id, month: t.month } } });
    console.log(`  fatura ${month}: "${t.description}" ${formatCents(decimalToCents(String(t.amount)))} · linha do mês ${line ? (line.paid ? "já baixada (fica como está)" : "em aberto → será consumida") : "—"}`);
  }
  if (!APPLY) {
    console.log("\nSimulação. Rode com --apply para gravar.");
    return;
  }

  if (!item.subscription?.active) {
    const r = await createCardSubscription({
      card: { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
      description: NAME,
      bankDescription: BANK_TEXT,
      amount: amountCents / 100,
      chargeDay: CHARGE_DAY,
    });
    if ("error" in r) throw new Error(r.error);
    console.log(`✓ assinatura criada${r.adopted ? " (adotou o item existente)" : ""}`);
  }
  const sub = await prisma.cardSubscription.findUnique({ where: { itemId: item.id } });
  if (!sub) throw new Error("Assinatura não encontrada depois de criar.");

  for (const t of charges) {
    const month = monthStringFromDate(t.month);
    const cents = decimalToCents(String(t.amount));
    await consumeSubscriptionCharge({ id: card.id }, month, t.description, cents, t.purchaseDate?.toISOString().slice(0, 10));
    if (t.subscriptionId !== sub.id) await prisma.cardTransaction.update({ where: { id: t.id }, data: { subscriptionId: sub.id } });
  }

  console.log("\nLinhas depois:");
  const rows = await prisma.monthlyEntry.findMany({ where: { itemId: item.id, month: { lte: monthToDate("2027-01") } }, orderBy: { month: "asc" } });
  for (const r of rows) {
    console.log(`  ${monthStringFromDate(r.month)} previsto ${formatCents(decimalToCents(String(r.plannedAmount)))} ${r.paid ? `pago ${formatCents(decimalToCents(String(r.paidAmount ?? 0)))}` : "em aberto"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
