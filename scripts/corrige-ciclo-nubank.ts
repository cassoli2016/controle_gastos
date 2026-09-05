// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { formatCents, decimalToCents, centsToNumber } from "@/lib/money";
import { upsertCardEntry } from "@/lib/card-entry";

/**
 * Move para out/2026 as compras do dia 04/09 que o app deixou em set/2026, e
 * corrige o dia de fechamento do Nubank. Para rodar UMA vez.
 *
 * O CSV da fatura que vence em 12/10 (Nubank_20261012.csv) inclui compras do
 * dia 04/09 — logo, no Nubank o dia do fechamento JÁ PERTENCE ao ciclo novo. A
 * regra do app (`day <= closingDay` fica no mês, lib/fatura.ts) mandava essas
 * 7 compras para setembro, e a fatura de outubro saía R$ 608,84 menor.
 *
 * A prova fecha dos dois lados: sem elas, setembro dá R$ 22.353,28 — o mesmo
 * "Pagamento recebido" que o CSV de outubro registra.
 *
 * closingDay passa de 4 para 3: o campo guarda o ÚLTIMO dia que ainda entra na
 * fatura, e no Nubank esse dia é o 3. Não mexe no Bradesco, cuja convenção não
 * foi verificada.
 *
 * Uso: npx tsx scripts/corrige-ciclo-nubank.ts           (simula)
 *      npx tsx scripts/corrige-ciclo-nubank.ts --apply   (grava)
 */

const APPLY = process.argv.includes("--apply");

/** As 7 compras do CSV, na ordem em que aparecem no arquivo. */
const ESPERADAS = [
  ["Associacao Franciscana - Parcela 1/8", 3100],
  ["Raia2824", 2099],
  ["Festval Torres", 10175],
  ["Ec *Melimais", 990],
  ["Festval Torres", 5592],
  ["Festval Torres", 4384],
  ["Abastec*Abastece Ai", 34544],
] as const;
const ESPERADO_CENTS = 60884;
/** Fatura de setembro depois da correção = o "Pagamento recebido" do CSV. */
const SETEMBRO_ESPERADO = 2235328;
const OUTUBRO_ESPERADO = 844250;

async function main() {
  const card = await prisma.creditCard.findFirst({ where: { name: "Nubank" } });
  if (!card) return console.error("ABORTA: cartão Nubank não encontrado.");

  const candidatas = await prisma.cardTransaction.findMany({
    where: {
      cardId: card.id,
      month: monthToDate("2026-09"),
      purchaseDate: new Date("2026-09-04T00:00:00Z"),
    },
    orderBy: { id: "asc" },
  });
  // Só as que vieram do CSV de outubro: as outras compras do dia 4 (YouTube,
  // Gian Franco, Hamburgueria) são de importação anterior e ficam onde estão.
  const mover = candidatas.filter((t) =>
    ESPERADAS.some(([d, c]) => t.description === d && decimalToCents(String(t.amount)) === c),
  );
  const soma = mover.reduce((a, t) => a + decimalToCents(String(t.amount)), 0);

  console.log(`compras do dia 04/09 em setembro: ${candidatas.length} · a mover: ${mover.length} (${formatCents(soma)})`);
  for (const t of mover) console.log(`   ${t.description.padEnd(36).slice(0,36)} ${formatCents(decimalToCents(String(t.amount))).padStart(11)}`);

  if (mover.length !== ESPERADAS.length || soma !== ESPERADO_CENTS) {
    console.error(`\nABORTA: esperava ${ESPERADAS.length} linhas somando ${formatCents(ESPERADO_CENTS)}.`);
    process.exitCode = 1;
    return;
  }

  if (!APPLY) return console.log("\nSimulação. Nada foi gravado — rode com --apply para valer.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("backups", { recursive: true });
  const file = `backups/ciclo-nubank-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ movedAt: new Date().toISOString(), closingDayAntes: card.closingDay, rows: mover }, null, 2));
  console.log(`\nBackup: ${file}`);

  await prisma.$transaction(async (tx) => {
    await tx.cardTransaction.updateMany({
      where: { id: { in: mover.map((t) => t.id) } },
      data: { month: monthToDate("2026-10") },
    });
    await tx.creditCard.update({ where: { id: card.id }, data: { closingDay: 3 } });
  });

  // Reescreve os dois consolidados a partir do extrato corrigido.
  for (const m of ["2026-09", "2026-10"]) {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(m) },
      _sum: { amount: true },
    });
    const total = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month: m, amountCents: total, mode: "set" });
    console.log(`  ${m}: consolidado = ${formatCents(total)}`);
  }

  // A baixa de setembro tem de refletir o valor certo da fatura.
  const setEntry = await prisma.monthlyEntry.findFirst({
    where: { cardId: card.id, month: monthToDate("2026-09"), purchaseDate: null },
  });
  if (setEntry?.paid) {
    await prisma.monthlyEntry.update({
      where: { id: setEntry.id },
      data: { paidAmount: centsToNumber(SETEMBRO_ESPERADO) },
    });
    console.log(`  baixa de setembro ajustada para ${formatCents(SETEMBRO_ESPERADO)}`);
  }

  const conf = async (m: string, esperado: number) => {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(m) },
      _sum: { amount: true },
    });
    const t = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    console.log(`  ${t === esperado ? "✓" : "✗"} ${m}: ${formatCents(t)} (esperado ${formatCents(esperado)})`);
  };
  console.log("\nconferência:");
  await conf("2026-09", SETEMBRO_ESPERADO);
  await conf("2026-10", OUTUBRO_ESPERADO);
}

main().finally(() => prisma.$disconnect());
