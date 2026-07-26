import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { plannedBalance } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { decimalToCents } from "@/lib/money";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";

export type NegativeMonth = { month: string; balanceCents: number };

/**
 * Meses (do corrente em diante) cujo saldo previsto é negativo — o
 * "descoberto" que as caixinhas de reserva precisam cobrir.
 */
export async function getNegativeMonths(): Promise<NegativeMonth[]> {
  // "Hoje" vem sempre de todayISOInSaoPaulo() (regra do projeto): usar
  // `new Date()` aqui divergiria no fuso do servidor e poderia trocar de mês
  // horas antes/depois do que o resto do app, nas primeiras horas do dia 1.
  const today = todayISOInSaoPaulo();
  const current = monthToDate(today.slice(0, 7));
  const rows = await prisma.monthlyEntry.findMany({
    where: { month: { gte: current } },
    include: { item: { include: { category: true } }, category: true },
    orderBy: { month: "asc" },
  });

  const byMonth = new Map<string, EntryView[]>();
  for (const r of rows) {
    const key = monthStringFromDate(r.month);
    const list = byMonth.get(key) ?? [];
    list.push(toEntryView(r as never));
    byMonth.set(key, list);
  }

  // A reserva do dia a dia é despesa do mês, então pesa no descoberto: um mês
  // que fecharia no zero passa a precisar de cobertura.
  const budget = await getDailyBudget();

  const out: NegativeMonth[] = [];
  for (const [month, views] of byMonth) {
    const withBudget = budget
      ? [...views, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]
      : views;
    const balanceCents = plannedBalance(withBudget);
    if (balanceCents < 0) out.push({ month, balanceCents });
  }
  return out; // rows vêm ordenadas por mês; Map preserva a ordem de inserção
}

export type ReserveView = { id: string; name: string; amountCents: number };

/** Caixinhas de reserva com valores em centavos (para exibição/cálculo). */
export async function getReserves(): Promise<ReserveView[]> {
  const boxes = await prisma.reserveBox.findMany({ orderBy: { name: "asc" } });
  return boxes.map((b) => ({
    id: b.id,
    name: b.name,
    amountCents: decimalToCents(String(b.amount)),
  }));
}

/** Valor por dia da reserva do dia a dia; null = ainda não configurado. */
export async function getDailyBudget(): Promise<{ perDayCents: number } | null> {
  const row = await prisma.dailyBudget.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return { perDayCents: decimalToCents(String(row.amountPerDay)) };
}
