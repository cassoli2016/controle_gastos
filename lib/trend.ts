/**
 * Tendência: a mesma curva das reservas, trocando UM número — a reserva do dia
 * a dia dos meses à frente pelo gasto variável que de fato passou no cartão nos
 * últimos ciclos fechados.
 *
 * Existe porque a curva planejada responde "e se eu gastar o que decidi gastar"
 * (R$ 150/dia é uma meta, escolhida de propósito), enquanto o gasto à vista
 * medido nos ciclos de ago–out/2026 foi R$ 331/dia. As duas curvas valem: uma é
 * o plano, a outra é o que vem acontecendo. Mostrar só a primeira dizia que as
 * reservas "só crescem" quando, no ritmo real, elas zeravam em um ano.
 *
 * Puro — quem lê o banco é lib/planning.ts.
 */
import type { EntryView } from "@/lib/calc";
import { dailyBudgetLine, daysInMonth, DAILY_BUDGET_ENTRY_ID } from "@/lib/daily-budget";
import { dailyBudgetEntryView } from "@/lib/entries";
import { formatCents } from "@/lib/money";
import { shortMonthLabel } from "@/lib/matrix";

/** Gasto À VISTA (não parcelado, positivo) de um ciclo de cartão, por competência. */
export type CycleSpend = { monthISO: string; vistaCents: number };

/**
 * Média por dia do gasto à vista nos ciclos informados. Divide pelo total de
 * dias dos meses, não por 30: três ciclos de 31, 30 e 31 dias são 92 dias.
 * null sem ciclo nenhum — sem fatura fechada não há tendência a medir.
 */
export function observedPerDay(cycles: CycleSpend[]): number | null {
  if (cycles.length === 0) return null;
  const total = cycles.reduce((a, c) => a + c.vistaCents, 0);
  const days = cycles.reduce((a, c) => a + daysInMonth(c.monthISO), 0);
  return Math.round(total / days);
}

/** "ago/26, set/26 e out/26" — os ciclos que a média cobre, em ordem. */
export function cyclesLabel(cycles: CycleSpend[]): string {
  const labels = [...cycles].sort((a, b) => (a.monthISO < b.monthISO ? -1 : 1)).map((c) => shortMonthLabel(c.monthISO));
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

/**
 * Os meses DEPOIS de `currentMonth` com a reserva do dia a dia trocada por
 * `perDayCents`. O mês corrente e os passados ficam como estão: o que já foi
 * gasto neles já está na fatura, e a reserva que resta é a decisão de hoje.
 * Mês sem lançamento nenhum continua vazio (mesma regra das telas).
 */
export function withVariableSpend(
  byMonth: Map<string, EntryView[]>,
  currentMonth: string,
  todayISO: string,
  perDayCents: number,
): Map<string, EntryView[]> {
  const out = new Map<string, EntryView[]>();
  for (const [month, views] of byMonth) {
    if (month <= currentMonth || views.length === 0) {
      out.set(month, views);
      continue;
    }
    const semReserva = views.filter((v) => v.categoryId !== DAILY_BUDGET_ENTRY_ID);
    out.set(month, [...semReserva, dailyBudgetEntryView(dailyBudgetLine(month, todayISO, perDayCents))]);
  }
  return out;
}

export type CurvePoint = { month: string; reservesCents: number };

export type CurveSummary = {
  /** Reservas no último ponto dentro do horizonte, e o mês dele. */
  atHorizonCents: number | null;
  atHorizonMonth: string | null;
  /** Primeiro mês em que as reservas ficam negativas dentro do horizonte. */
  firstNegativeMonth: string | null;
};

/** Resumo dos primeiros `horizonMonths` pontos da curva. */
export function curveSummary(curve: CurvePoint[], horizonMonths = 12): CurveSummary {
  const window = curve.slice(0, horizonMonths);
  const last = window[window.length - 1];
  return {
    atHorizonCents: last?.reservesCents ?? null,
    atHorizonMonth: last?.month ?? null,
    firstNegativeMonth: window.find((p) => p.reservesCents < 0)?.month ?? null,
  };
}

/**
 * Frase da tendência no card de Reservas. Diz o que acontece com as caixinhas
 * em um ano se o gasto variável continuar como nos últimos ciclos.
 */
export function trendSentence(summary: CurveSummary, startCents: number): string {
  if (summary.atHorizonCents === null || summary.atHorizonMonth === null) return "Sem meses à frente para projetar.";
  if (summary.firstNegativeMonth !== null) {
    return `No ritmo dos últimos ciclos, as caixinhas acabam em ${shortMonthLabel(summary.firstNegativeMonth)}.`;
  }
  const where = shortMonthLabel(summary.atHorizonMonth);
  if (summary.atHorizonCents < startCents) {
    return `No ritmo dos últimos ciclos, as reservas caem para ${formatCents(summary.atHorizonCents)} em ${where}.`;
  }
  return `No ritmo dos últimos ciclos, as reservas chegam a ${formatCents(summary.atHorizonCents)} em ${where}.`;
}
