import { daysInMonth } from "@/lib/daily-budget";

/** Subconjunto de DisplayRow que o fluxo diário precisa (estruturalmente compatível). */
export type CashflowRow = {
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  paidDate: Date | null;
  dueDay: number | null;
  purchaseDate: Date | null;
};

export type CashflowDay = { day: number; inCents: number; outCents: number; cumulativeCents: number };

export type CashflowVerdict =
  | { alwaysPositive: true }
  | { alwaysPositive: false; firstNegativeDay: number; lastNegativeDay: number; minCents: number; minDay: number };

export type Cashflow = { days: CashflowDay[]; verdict: CashflowVerdict };

/** Dia (1..total) em que a linha conta no fluxo do mês. */
function flowDay(row: CashflowRow, month: string, total: number): number {
  const clamp = (d: number) => Math.min(Math.max(d, 1), total);
  if (row.paid && row.paidDate) {
    const paidMonth = row.paidDate.toISOString().slice(0, 7);
    // Pago fora do mês de competência encosta na borda (antes → dia 1; depois → último).
    if (paidMonth < month) return 1;
    if (paidMonth > month) return total;
    return clamp(row.paidDate.getUTCDate());
  }
  if (row.dueDay !== null) return clamp(row.dueDay);
  if (row.purchaseDate) return clamp(row.purchaseDate.getUTCDate());
  // Sem data: pessimista — a despesa cobra logo, a receita só entra no fim.
  return row.categoryType === "EXPENSE" ? 1 : total;
}

/**
 * Saldo acumulado dia a dia do mês, partindo de zero: pago entra na data real
 * com o valor real; aberto entra na data prevista. `budget` é a reserva do dia
 * a dia (perDayCents nos dias cobertos), passada à parte para não duplicar com
 * a linha derivada da lista.
 */
export function dailyCashflow(
  rows: CashflowRow[],
  month: string,
  todayISO: string,
  budget: { perDayCents: number } | null,
): Cashflow {
  const total = daysInMonth(month);
  const inByDay: number[] = new Array(total + 1).fill(0);
  const outByDay: number[] = new Array(total + 1).fill(0);

  for (const row of rows) {
    const cents = row.paid ? (row.paidCents ?? row.plannedCents) : row.plannedCents;
    const day = flowDay(row, month, total);
    if (row.categoryType === "INCOME") inByDay[day] += cents;
    else outByDay[day] += cents;
  }

  if (budget) {
    const todayMonth = todayISO.slice(0, 7);
    const start = month > todayMonth ? 1 : month < todayMonth ? total + 1 : Number(todayISO.slice(8, 10));
    for (let d = start; d <= total; d++) outByDay[d] += budget.perDayCents;
  }

  const days: CashflowDay[] = [];
  let cumulative = 0;
  for (let d = 1; d <= total; d++) {
    cumulative += inByDay[d] - outByDay[d];
    days.push({ day: d, inCents: inByDay[d], outCents: outByDay[d], cumulativeCents: cumulative });
  }

  const negatives = days.filter((x) => x.cumulativeCents < 0);
  if (negatives.length === 0) return { days, verdict: { alwaysPositive: true } };
  const min = negatives.reduce((a, b) => (b.cumulativeCents < a.cumulativeCents ? b : a));
  return {
    days,
    verdict: {
      alwaysPositive: false,
      firstNegativeDay: negatives[0].day,
      lastNegativeDay: negatives[negatives.length - 1].day,
      minCents: min.cumulativeCents,
      minDay: min.day,
    },
  };
}
