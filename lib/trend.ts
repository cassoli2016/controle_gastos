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
 * "Aut*04de04": cobrança parcelada FORA do cartão (o seguro do carro em 4×,
 * cobrado pela seguradora). A fatura não sabe que é parcela, e por isso
 * `readInstallment` não lê esse formato (ele esperaria as próximas parcelas
 * provisionadas). Para o ritmo de gasto, porém, não é compra do dia a dia: o
 * seguro seguinte já está lançado como conta fixa.
 */
const OUTSIDE_INSTALLMENT_RE = /\*(\d{2})de(\d{2})$/i;

/**
 * A transação conta no ritmo de gasto variável? Só compra à vista positiva que
 * não esteja já prevista em outro lugar dos meses à frente:
 * - parcela (da fatura ou parcelada fora do cartão) — já é provisão ou acabou;
 * - assinatura com linha no Mês (`hasPlannedLine`) — a linha fixa já cobra o
 *   mesmo valor todo mês; contar no ritmo também cobrava duas vezes
 *   (R$ 118,80/mês em nov/2026: YouTube, iCloud, Nucel).
 */
export function countsAsVariableSpend(t: {
  cents: number;
  description: string;
  isInstallment: boolean;
  hasPlannedLine: boolean;
}): boolean {
  if (t.cents <= 0 || t.isInstallment || t.hasPlannedLine) return false;
  const m = OUTSIDE_INSTALLMENT_RE.exec(t.description.trim());
  return !(m && Number(m[1]) <= Number(m[2]));
}

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

/**
 * Resumo da curva até `monthsAhead` meses DEPOIS do primeiro ponto. O primeiro
 * ponto é o mês corrente, então "um ano à frente" são 13 pontos: em nov/26 a
 * frase fala de nov/27. Cortar em 12 pontos parava em out/27 e soava como se o
 * app ainda estivesse em outubro.
 */
export function curveSummary(curve: CurvePoint[], monthsAhead = 12): CurveSummary {
  const window = curve.slice(0, monthsAhead + 1);
  const last = window[window.length - 1];
  return {
    atHorizonCents: last?.reservesCents ?? null,
    atHorizonMonth: last?.month ?? null,
    firstNegativeMonth: window.find((p) => p.reservesCents < 0)?.month ?? null,
  };
}

/** O ritmo que a frase cita: o observado e, se houver, a meta do dia a dia. */
export type TrendPace = { observedPerDayCents: number; planPerDayCents: number | null };

/** A curva termina abaixo do ponto de partida (ou zera)? Define o tom da frase. */
export function trendFalls(summary: CurveSummary, startCents: number): boolean {
  return summary.firstNegativeMonth !== null || (summary.atHorizonCents !== null && summary.atHorizonCents < startCents);
}

/**
 * Frase da tendência no Dashboard. Diz o que acontece com as caixinhas em um
 * ano SE o gasto à vista no cartão continuar como nos últimos ciclos.
 *
 * Cita o ritmo, a meta e o saldo de hoje de propósito: "as reservas caem para
 * R$ 19.460,27" sozinha foi lida como erro por quem tem R$ 34.538 guardados
 * hoje — faltava dizer que é uma condição (o ritmo atual) e de onde parte.
 */
export function trendSentence(summary: CurveSummary, startCents: number, pace: TrendPace): string {
  if (summary.atHorizonCents === null || summary.atHorizonMonth === null) return "Sem meses à frente para projetar.";
  const meta = pace.planPerDayCents !== null ? ` (sua meta é ${formatCents(pace.planPerDayCents)})` : "";
  const se = `Se o cartão seguir em ${formatCents(pace.observedPerDayCents)}/dia${meta}`;
  if (summary.firstNegativeMonth !== null) {
    return `${se}, as caixinhas acabam em ${shortMonthLabel(summary.firstNegativeMonth)}.`;
  }
  const where = shortMonthLabel(summary.atHorizonMonth);
  const verbo = summary.atHorizonCents < startCents ? "caem" : "vão";
  return `${se}, as reservas ${verbo} de ${formatCents(startCents)} hoje para ${formatCents(summary.atHorizonCents)} em ${where}.`;
}
