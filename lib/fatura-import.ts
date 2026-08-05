import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { replaceCardMonth, upsertCardEntry, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import { buildInstallmentSchedule, ownedByRebuild, type FaturaBank, type FaturaLine } from "@/lib/fatura-core";

/**
 * Aplica uma fatura já parseada e validada (`lib/fatura-parse.ts`), de qualquer
 * banco: replace do mês-alvo + reconstrução dos meses seguintes pelo cronograma
 * de parcelas (generalização dos scripts fix-fatura-ago-bradesco/
 * fix-faturas-futuras-bradesco, validados em prod).
 *
 * Preserva antecipações (prepayment) e compras com data APÓS o fechamento
 * (ciclo novo, não pertencem à fatura fechada). Idempotente: reimportar a mesma
 * fatura produz o mesmo estado.
 */
export async function applyFaturaImport(opts: {
  card: CardRef;
  /** Define o formato do marcador de parcela na projeção dos meses futuros. */
  bank: FaturaBank;
  faturaMonth: string;
  closingISO: string;
  /** Limite de compras da fatura: quando presente, atualiza o cartão. */
  limitCents?: number | null;
  lines: FaturaLine[];
}): Promise<{ months: { month: string; totalCents: number }[] }> {
  const { card, bank, faturaMonth, closingISO, lines } = opts;
  if (opts.limitCents != null && opts.limitCents > 0) {
    await prisma.creditCard.update({
      where: { id: card.id },
      data: { limitAmount: centsToNumber(opts.limitCents) },
    });
  }
  const rows: CardMonthRow[] = lines
    .filter((l) => l.kind !== "payment")
    .map((l) => ({ description: l.description, amountCents: l.cents, dateISO: l.dateISO }));
  const target = await replaceCardMonth(card, faturaMonth, rows);
  const months = [{ month: faturaMonth, totalCents: target.totalCents }];

  const schedule = buildInstallmentSchedule(lines, faturaMonth, bank);
  // Reconstruir: meses do cronograma ∪ meses futuros que já têm extrato
  // (projeções antigas que o cronograma novo não cobre precisam ser zeradas).
  const existing = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(faturaMonth) } },
    select: { month: true },
    distinct: ["month"],
  });
  const monthsToRebuild = [
    ...new Set([...schedule.keys(), ...existing.map((e) => monthStringFromDate(e.month))]),
  ].sort();
  const cutoff = new Date(closingISO + "T23:59:59Z");

  for (const month of monthsToRebuild) {
    const monthDate = monthToDate(month);
    // Fora só o que a reconstrução realmente possui: projeção sem data e parcela
    // datada até o fechamento (`ownedByRebuild`). Compra à vista fica, mesmo
    // datada antes do fechamento — o corte do Nubank é intradiário e há compra
    // do ciclo novo com data anterior. Filtrar em JS porque a decisão depende do
    // marcador de parcela na descrição, que o Prisma não sabe casar.
    const candidates = await prisma.cardTransaction.findMany({
      where: { cardId: card.id, month: monthDate, prepayment: false },
      select: { id: true, description: true, purchaseDate: true },
    });
    const doomed = candidates.filter((c) => ownedByRebuild(c, cutoff)).map((c) => c.id);
    if (doomed.length > 0) {
      await prisma.cardTransaction.deleteMany({ where: { id: { in: doomed } } });
    }
    const derived = schedule.get(month) ?? [];
    if (derived.length > 0) {
      await prisma.cardTransaction.createMany({
        data: derived.map((r) => ({
          cardId: card.id,
          month: monthDate,
          description: r.description,
          amount: centsToNumber(r.cents),
          purchaseDate: new Date(r.dateISO + "T00:00:00Z"),
        })),
      });
    }
    // Consolidado = soma líquida do extrato do mês (inclui preservadas).
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthDate },
      _sum: { amount: true },
    });
    const totalCents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
    months.push({ month, totalCents });
  }
  return { months };
}
