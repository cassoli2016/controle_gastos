import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { replaceCardMonth, upsertCardEntry, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import type { FaturaBank, FaturaLine } from "@/lib/fatura-core";
import { findOrphans, toAppRow, type AppRow } from "@/lib/fatura-match";
import { faturaPlanStates, reconcileTail, shiftMonthISO } from "@/lib/fatura-plan";

/**
 * Aplica uma fatura já parseada e validada (`lib/fatura-parse.ts`), de qualquer
 * banco. A fatura é tratada como o ESTADO DOS PLANOS, não como o total do mês:
 *
 *   1. O mês da fatura é substituído pelas linhas dela.
 *   2. O que o app tinha no mês e a fatura NÃO cobrou (órfã) caminha para frente
 *      em vez de desaparecer no replace — à vista vira lançamento do mês
 *      seguinte, e parcela faz o plano inteiro deslocar.
 *   3. A cauda de cada plano nos meses futuros é acertada para o que a fatura
 *      implica: completa o que falta, remove o que ela diz que não existe mais.
 *
 * Preserva antecipações (`prepayment`), compras à vista de meses futuros e planos
 * que a fatura não conhece (compra feita depois do fechamento). Idempotente:
 * reimportar a mesma fatura produz o mesmo estado.
 */
export async function applyFaturaImport(opts: {
  card: CardRef;
  bank: FaturaBank;
  faturaMonth: string;
  /** Limite de compras da fatura: quando presente, atualiza o cartão. */
  limitCents?: number | null;
  lines: FaturaLine[];
}): Promise<{
  months: { month: string; totalCents: number }[];
  orphansMoved: number;
  tailActions: number;
}> {
  const { card, faturaMonth, lines } = opts;
  if (opts.limitCents != null && opts.limitCents > 0) {
    await prisma.creditCard.update({
      where: { id: card.id },
      data: { limitAmount: centsToNumber(opts.limitCents) },
    });
  }

  // O que o app tinha no mês ANTES do replace — é dele que saem as órfãs.
  const beforeReplace = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: monthToDate(faturaMonth), prepayment: false },
    select: {
      id: true,
      description: true,
      bankDescription: true,
      amount: true,
      installmentSeq: true,
      installmentCount: true,
    },
  });
  const orphans = findOrphans(beforeReplace.map(toAppRow), lines);

  const rows: CardMonthRow[] = lines
    .filter((l) => l.kind !== "payment")
    .map((l) => ({
      description: l.description,
      bankDescription: l.description,
      amountCents: l.cents,
      dateISO: l.dateISO,
    }));
  const target = await replaceCardMonth(card, faturaMonth, rows);
  const months = [{ month: faturaMonth, totalCents: target.totalCents }];

  // Órfã à vista: o banco não cobrou neste ciclo, então cobra no seguinte. Sem
  // data de compra — a original ficou no ciclo que fechou e reusá-la faria a
  // linha ser roteada de volta para cá numa importação futura.
  const nextMonth = shiftMonthISO(faturaMonth, 1);
  const vistaOrphans = orphans.filter((o) => !o.installment);
  if (vistaOrphans.length > 0) {
    await prisma.cardTransaction.createMany({
      data: vistaOrphans.map((o) => ({
        cardId: card.id,
        month: monthToDate(nextMonth),
        description: o.description,
        amount: centsToNumber(o.cents),
        purchaseDate: null,
      })),
    });
  }

  // Cauda dos planos. Órfã de parcela entra em `faturaPlanStates` como "cobrado
  // até a anterior", e é isso que desloca o plano.
  const states = faturaPlanStates(lines, orphans);
  const future = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(faturaMonth) }, prepayment: false },
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
  for (const r of future) {
    const month = monthStringFromDate(r.month);
    existingByMonth.set(month, [...(existingByMonth.get(month) ?? []), toAppRow(r)]);
  }
  const actions = reconcileTail({ states, faturaMonth, existingByMonth, bank: opts.bank });

  const doomed = actions.flatMap((a) => (a.kind === "delete" ? [a.id] : []));
  if (doomed.length > 0) await prisma.cardTransaction.deleteMany({ where: { id: { in: doomed } } });
  const inserts = actions.flatMap((a) => (a.kind === "insert" ? [a] : []));
  if (inserts.length > 0) {
    await prisma.cardTransaction.createMany({
      data: inserts.map((a) => ({
        cardId: card.id,
        month: monthToDate(a.month),
        description: a.description,
        // A cauda é derivada da fatura, então o texto gerado JÁ é o do banco.
        bankDescription: a.description,
        amount: centsToNumber(a.cents),
        installmentSeq: a.seq,
        installmentCount: a.count,
      })),
    });
  }

  // Consolidado = soma líquida do extrato de cada mês tocado.
  const touched = [
    ...new Set([nextMonth, ...inserts.map((a) => a.month), ...existingByMonth.keys()]),
  ].sort();
  for (const month of touched) {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(month) },
      _sum: { amount: true },
    });
    const totalCents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
    months.push({ month, totalCents });
  }
  return { months, orphansMoved: orphans.length, tailActions: actions.length };
}
