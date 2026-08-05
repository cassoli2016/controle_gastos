import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { replaceCardMonth, upsertCardEntry, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import { buildInstallmentSchedule, type FaturaLine } from "@/lib/fatura-core";

/**
 * Aplica a fatura importada: replace do mês-alvo + reconstrução dos meses
 * seguintes pelo cronograma de parcelas (generalização dos scripts
 * fix-fatura-ago-bradesco/fix-faturas-futuras-bradesco, validados em prod).
 * Preserva antecipações (prepayment) e compras com data APÓS o fechamento
 * (ciclo novo, não pertencem à fatura fechada). Idempotente: reimportar a
 * mesma fatura produz o mesmo estado.
 */
export async function applyBradescoFaturaImport(opts: {
  card: CardRef;
  faturaMonth: string;
  closingISO: string;
  /** "Limite de compras" da fatura: quando presente, atualiza o cartão. */
  limitCents?: number | null;
  lines: FaturaLine[];
}): Promise<{ months: { month: string; totalCents: number }[] }> {
  const { card, faturaMonth, closingISO, lines } = opts;
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

  const schedule = buildInstallmentSchedule(lines, faturaMonth, "bradesco");
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
    // Fora: projeções sem data e parcelas com compra até o fechamento (a
    // fatura agora é a fonte). Ficam: ciclo novo (data > fechamento) e prepay.
    await prisma.cardTransaction.deleteMany({
      where: {
        cardId: card.id,
        month: monthDate,
        prepayment: false,
        OR: [{ purchaseDate: null }, { purchaseDate: { lte: cutoff } }],
      },
    });
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
