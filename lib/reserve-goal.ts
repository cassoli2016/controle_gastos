/**
 * Meta de uma caixinha: quanto falta, em que ponto está e quanto guardar por
 * mês para chegar lá no prazo. Puro — só aritmética de centavos e meses.
 */
import { formatCents } from "@/lib/money";

export type GoalProgress = {
  /** 0–100, travado em 100. */
  pct: number;
  remainingCents: number;
  reached: boolean;
  /** Meses até o prazo (0 = o prazo é este mês); null sem prazo. */
  monthsLeft: number | null;
  /** Quanto guardar por mês para chegar no prazo; null sem prazo ou já atingida. */
  perMonthCents: number | null;
};

/** Meses de `fromISO` até `toISO` ("YYYY-MM"); negativo quando o prazo já passou. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function goalProgress(
  amountCents: number,
  goalCents: number,
  goalMonth: string | null,
  currentMonth: string,
): GoalProgress {
  const pct = goalCents <= 0 ? 0 : Math.min(100, Math.round((amountCents / goalCents) * 100));
  const remainingCents = Math.max(0, goalCents - amountCents);
  const reached = remainingCents === 0;
  const monthsLeft = goalMonth === null ? null : Math.max(0, monthsBetween(currentMonth, goalMonth));
  const perMonthCents =
    reached || monthsLeft === null ? null : monthsLeft === 0 ? remainingCents : Math.ceil(remainingCents / monthsLeft);
  return { pct, remainingCents, reached, monthsLeft, perMonthCents };
}

/** A frase do card: o que falta e o ritmo para chegar lá. */
export function goalSentence(p: GoalProgress, goalMonthLabel: string | null): string {
  if (p.reached) return "Meta atingida.";
  const falta = `Faltam ${formatCents(p.remainingCents)}`;
  if (p.monthsLeft === null || goalMonthLabel === null) return `${falta}.`;
  if (p.monthsLeft === 0) return `${falta}; o prazo é este mês.`;
  return `${falta}: ${formatCents(p.perMonthCents ?? 0)} por mês até ${goalMonthLabel}.`;
}
