// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { createCardSubscription, consumeSubscriptionCharge } from "@/lib/card-subscription";
import { descriptionsMatch } from "@/lib/description-match";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Vincula contas fixas que JÁ EXISTEM como Item às suas assinaturas de cartão, e
 * consome as cobranças que já estão dentro de faturas importadas.
 *
 * Por que: sem o vínculo, `consumeSubscriptionCharge` nunca roda e a conta é
 * contada duas vezes no mês — a linha própria e a cobrança dentro do consolidado
 * do cartão. Medido: R$ 98,90 a mais em ago/2026 e R$ 53,90 em set/2026.
 *
 * Uso: npx tsx scripts/adota-assinaturas.ts          (simula)
 *      npx tsx scripts/adota-assinaturas.ts --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");

/**
 * [nome do Item, nome do cartão, dia da cobrança, texto do banco].
 *
 * O 4º campo é a `description` da ASSINATURA, que é chave de casamento contra a
 * fatura — não rótulo. `descriptionsMatch` compara por conter, e "YouTube
 * Premium" NÃO está contido em "Google Youtubepremium" por causa do espaço:
 * sem o texto do banco aqui, o consumo nunca casaria e a conta seguiria dupla.
 * O nome amigável continua no Item, que é o que aparece na tela do Mês.
 */
const ADOPT: [string, string, number, string][] = [
  ["YouTube Premium", "Nubank", 3, "Youtubepremium"],
  ["Nucel", "Nubank", 27, "NuCel"],
];

/** Meses cujas faturas já foram importadas e podem conter a cobrança. */
const MONTHS = ["2026-08", "2026-09"];

async function main() {
  console.log(APPLY ? "MODO: gravando (--apply)\n" : "MODO: simulação — nada será gravado\n");

  for (const [itemName, cardName, chargeDay, bankText] of ADOPT) {
    const item = await prisma.item.findFirst({
      where: { active: true, name: { equals: itemName, mode: "insensitive" } },
      include: { subscription: true },
    });
    if (!item) {
      console.log(`✗ "${itemName}": item ativo não encontrado`);
      continue;
    }
    if (item.subscription) {
      console.log(`• "${itemName}": já vinculado a uma assinatura — nada a fazer`);
      continue;
    }
    const card = await prisma.creditCard.findFirst({
      where: { active: true, name: { contains: cardName, mode: "insensitive" } },
    });
    if (!card) {
      console.log(`✗ "${itemName}": cartão ${cardName} não encontrado`);
      continue;
    }

    // Valor da assinatura: o previsto da linha mais recente do item.
    const entry = await prisma.monthlyEntry.findFirst({
      where: { itemId: item.id },
      orderBy: { month: "desc" },
    });
    const amountCents = entry ? decimalToCents(String(entry.plannedAmount)) : 0;
    if (amountCents <= 0) {
      console.log(`✗ "${itemName}": sem linha com valor para inferir a mensalidade`);
      continue;
    }

    console.log(
      `→ "${itemName}" ${formatCents(amountCents)} · ${card.name} · dia ${chargeDay} · item existente será ADOTADO`,
    );

    // Cobranças já dentro de faturas importadas, que o consumo vai abater.
    for (const month of MONTHS) {
      const line = await prisma.monthlyEntry.findUnique({
        where: { itemId_month: { itemId: item.id, month: monthToDate(month) } },
      });
      const tx = await prisma.cardTransaction.findFirst({
        where: { cardId: card.id, month: monthToDate(month), amount: { gt: 0 } },
      });
      void tx;
      if (line && !line.paid) {
        console.log(`   ${month}: linha de ${formatCents(decimalToCents(String(line.plannedAmount)))} em aberto — será consumida se houver cobrança na fatura`);
      } else if (line?.paid) {
        console.log(`   ${month}: linha já paga (${formatCents(decimalToCents(String(line.paidAmount ?? 0)))})`);
      }
    }

    if (!APPLY) continue;

    const r = await createCardSubscription({
      card: { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
      description: bankText,
      amount: amountCents / 100,
      chargeDay,
    });
    if ("error" in r) {
      console.log(`   ✗ ${r.error}`);
      continue;
    }
    console.log(`   ✓ vinculado${r.adopted ? " (adotou o item existente)" : ""}`);

    // Consome as cobranças que já estão nas faturas importadas.
    for (const month of MONTHS) {
      const txs = await prisma.cardTransaction.findMany({
        where: { cardId: card.id, month: monthToDate(month), amount: { gt: 0 } },
        select: { description: true, amount: true, purchaseDate: true },
      });

      // Linha marcada como paga NA MÃO tendo a cobrança dentro da fatura: a
      // baixa manual é o duplicado (o dinheiro saiu pelo cartão). O consumo
      // ignora linha paga de propósito, para não sobrescrever pagamento de
      // verdade — então aqui a marcação é desfeita antes, e o consumo reescreve
      // com o valor real da fatura.
      const line = await prisma.monthlyEntry.findUnique({
        where: { itemId_month: { itemId: item.id, month: monthToDate(month) } },
      });
      if (line?.paid) {
        const cents = decimalToCents(String(line.plannedAmount));
        const dup = txs.find(
          (t) => decimalToCents(String(t.amount)) === cents && descriptionsMatch(t.description, bankText),
        );
        if (dup) {
          await prisma.monthlyEntry.update({
            where: { id: line.id },
            data: { paid: false, paidAmount: null, paidDate: null },
          });
          console.log(`   ↺ ${month}: baixa manual desfeita — a cobrança "${dup.description}" está na fatura`);
        }
      }

      for (const t of txs) {
        const cents = decimalToCents(String(t.amount));
        const consumed = await consumeSubscriptionCharge(
          { id: card.id },
          month,
          t.description,
          cents,
          t.purchaseDate ? t.purchaseDate.toISOString().slice(0, 10) : undefined,
        );
        if (consumed.subscriptionId) {
          console.log(`   ✓ ${month}: "${t.description}" ${formatCents(cents)} consumiu a linha`);
        }
      }
    }
  }

  // Estado final das linhas envolvidas.
  console.log("\nLinhas do mês depois:");
  for (const [itemName] of ADOPT) {
    const item = await prisma.item.findFirst({ where: { name: { equals: itemName, mode: "insensitive" } } });
    if (!item) continue;
    const rows = await prisma.monthlyEntry.findMany({
      where: { itemId: item.id, month: { in: MONTHS.map(monthToDate) } },
      orderBy: { month: "asc" },
    });
    for (const r of rows) {
      console.log(
        `  ${monthStringFromDate(r.month)} "${itemName}" previsto ${formatCents(decimalToCents(String(r.plannedAmount)))} ${r.paid ? `pago ${formatCents(decimalToCents(String(r.paidAmount ?? 0)))}` : "em aberto"}`,
      );
    }
  }
  if (!APPLY) console.log("\nSimulação. Rode com --apply para gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
