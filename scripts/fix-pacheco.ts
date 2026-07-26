// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { addPurchaseToCard, cardTargetMonth, type CardRef } from "@/lib/card-entry";

/**
 * Ajuste único (2026-07-26): a compra "Drogarias Pacheco" (3× R$ 87,92) foi
 * lançada pelo bot como AVULSA, começando em jul/26, porque o parser do
 * compartilhamento do Nubank perdeu as linhas de data e de cartão — a data
 * veio como "26 julho 2026" (sem os "de" que a regex exigia), e ao não casar
 * essa linha o parser abandonava o resto do bloco, inclusive "Cartão Nubank".
 *
 * O correto: 3 parcelas dentro da fatura do Nubank. Com compra em 26/07 e o
 * cartão fechando dia 4 e vencendo dia 10, a primeira parcela cai em ago/26.
 *
 * Este script apaga as linhas avulsas e relança pela mesma função que a UI e o
 * bot usam (`addPurchaseToCard`), o que mantém consolidado e extrato coerentes.
 *
 * Idempotente: rodar de novo não acha linha avulsa e não relança.
 *
 * Uso: npx tsx scripts/fix-pacheco.ts
 */

const DESCRICAO = "Drogarias Pacheco";
const VALOR_PARCELA_CENTS = 8792;
const PARCELAS = 3;
const DATA_COMPRA = "2026-07-26";

async function main() {
  const avulsas = await prisma.monthlyEntry.findMany({
    where: { description: DESCRICAO, cardId: null },
    orderBy: { month: "asc" },
  });

  if (avulsas.length === 0) {
    console.log(`Nenhuma linha avulsa de "${DESCRICAO}" — nada a corrigir.`);
    return;
  }

  console.log(`Linhas avulsas encontradas (${avulsas.length}):`);
  for (const e of avulsas) {
    console.log(`  ${e.month.toISOString().slice(0, 7)} · ${e.plannedAmount} · parcela ${e.installmentSeq}/${e.installmentCount}`);
  }
  await prisma.monthlyEntry.deleteMany({ where: { id: { in: avulsas.map((e) => e.id) } } });
  console.log(`→ ${avulsas.length} linha(s) avulsa(s) removida(s).\n`);

  const nubank = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: "nubank", mode: "insensitive" } },
  });
  if (!nubank) throw new Error("Cartão Nubank não encontrado — as linhas avulsas já foram removidas, relance pela tela.");

  const card: CardRef = {
    id: nubank.id,
    name: nubank.name,
    closingDay: nubank.closingDay,
    dueDay: nubank.dueDay,
  };
  const startMonth = cardTargetMonth(card, DATA_COMPRA, DATA_COMPRA.slice(0, 7));
  const { months } = await addPurchaseToCard(card, startMonth, VALOR_PARCELA_CENTS, PARCELAS, {
    description: DESCRICAO,
    dateISO: DATA_COMPRA,
  });

  console.log(
    `Relançada em ${card.name}: ${PARCELAS}× ${formatCents(VALOR_PARCELA_CENTS)} ` +
      `(total ${formatCents(VALOR_PARCELA_CENTS * PARCELAS)}) nas faturas ${months.join(", ")}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
