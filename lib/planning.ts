import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedBalance } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { decimalToCents } from "@/lib/money";

export type NegativeMonth = { month: string; balanceCents: number };

/**
 * Meses (do corrente em diante) cujo saldo previsto é negativo — o
 * "descoberto" que as caixinhas de reserva precisam cobrir.
 */
export async function getNegativeMonths(): Promise<NegativeMonth[]> {
  const current = monthToDate(monthStringFromDate(new Date()));
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

  const out: NegativeMonth[] = [];
  for (const [month, views] of byMonth) {
    const balanceCents = plannedBalance(views);
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
