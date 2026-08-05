// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { parseFatura } from "@/lib/fatura-parse";
import { findOrphans, toAppRow, type AppRow } from "@/lib/fatura-match";
import { faturaPlanStates, reconcileTail, shiftMonthISO, allPlans } from "@/lib/fatura-plan";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

/**
 * Simulação READ-ONLY do fechamento de fatura: mostra as órfãs e o que cada mês
 * viraria, sem gravar nada. É o portão antes de deixar a importação tocar
 * produção.
 *
 * Uso: npx tsx scripts/simula-fechamento-nubank.ts <caminho-do-pdf>
 */
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("informe o caminho do PDF da fatura");

  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const f = parseFatura((await extractText(pdf, { mergePages: true })).text);
  if ("error" in f) throw new Error(f.error);

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: f.bank, mode: "insensitive" } },
  });
  if (!card) throw new Error(`cartão ${f.bank} não encontrado`);

  const mesRows = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: monthToDate(f.faturaMonth), prepayment: false },
    select: {
      id: true,
      description: true,
      bankDescription: true,
      amount: true,
      installmentSeq: true,
      installmentCount: true,
    },
  });
  const orphans = findOrphans(mesRows.map(toAppRow), f.lines);

  console.log(`${card.name} · ${f.faturaMonth} · total da fatura ${formatCents(f.totalCents)}`);
  console.log(`${mesRows.length} linhas no app, ${f.lines.filter((l) => l.kind !== "payment").length} na fatura\n`);
  console.log(`ÓRFÃS: ${orphans.length} (${formatCents(orphans.reduce((a, o) => a + o.cents, 0))})`);
  for (const o of orphans) {
    console.log(`   ${o.description} ${formatCents(o.cents)}${o.installment ? ` [parcela ${o.installment.seq}/${o.installment.count}]` : ""}`);
  }

  const states = faturaPlanStates(f.lines, orphans);
  const future = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(f.faturaMonth) }, prepayment: false },
    select: {
      id: true,
      month: true,
      description: true,
      bankDescription: true,
      amount: true,
      installmentSeq: true,
      installmentCount: true,
    },
  });
  const existingByMonth = new Map<string, AppRow[]>();
  const centsById = new Map<string, number>();
  for (const r of future) {
    const month = monthStringFromDate(r.month);
    const row = toAppRow(r);
    centsById.set(row.id, row.cents);
    existingByMonth.set(month, [...(existingByMonth.get(month) ?? []), row]);
  }
  const actions = reconcileTail({ states, faturaMonth: f.faturaMonth, existingByMonth, bank: f.bank });

  console.log(`\n${allPlans(states).length} planos em ${states.size} baldes · ${actions.length} ações na cauda\n`);
  const nextMonth = shiftMonthISO(f.faturaMonth, 1);
  const orphanVista = orphans.filter((o) => !o.installment).reduce((a, o) => a + o.cents, 0);
  const meses = [
    ...new Set([
      ...existingByMonth.keys(),
      nextMonth,
      ...actions.flatMap((a) => (a.kind === "insert" ? [a.month] : [])),
    ]),
  ].sort();

  for (const month of meses) {
    const rows = existingByMonth.get(month) ?? [];
    const antes = rows.reduce((a, r) => a + r.cents, 0);
    const ids = new Set(rows.map((r) => r.id));
    const del = actions.filter((a) => a.kind === "delete" && ids.has(a.id));
    const ins = actions.flatMap((a) => (a.kind === "insert" && a.month === month ? [a] : []));
    const depois =
      antes -
      del.reduce((a, d) => a + (d.kind === "delete" ? (centsById.get(d.id) ?? 0) : 0), 0) +
      ins.reduce((a, i) => a + i.cents, 0) +
      (month === nextMonth ? orphanVista : 0);
    console.log(`  ${month}: ${formatCents(antes)} → ${formatCents(depois)} (−${del.length} +${ins.length})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
