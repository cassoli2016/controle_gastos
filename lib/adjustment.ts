import { monthToDate } from "@/lib/dates";

export type AdjustmentRule = {
  /** % de reajuste por aniversário (ex.: 10 = +10%), composto. */
  percent?: number | null;
  /** OU valor fixo em centavos somado por aniversário. */
  amountCents?: number | null;
};

/**
 * Quantos "aniversários" (meses cujo número é adjustMonth, 1-12) existem no
 * intervalo (fromMonth, toMonth] — meses no formato "YYYY-MM".
 */
export function anniversariesBetween(fromMonth: string, toMonth: string, adjustMonth: number): number {
  const from = monthToDate(fromMonth);
  const to = monthToDate(toMonth);
  if (to <= from) return 0;
  let count = 0;
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d <= to) {
    if (d.getUTCMonth() + 1 === adjustMonth) count++;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return count;
}

/**
 * Aplica `level` reajustes sobre a base: percentual composto (arredondando a
 * centavos a cada passo, como reajuste real) ou valor fixo linear. Base zero
 * nunca é reajustada (mês sem cobrança continua sem cobrança).
 */
export function adjustedCents(baseCents: number, level: number, rule: AdjustmentRule): number {
  if (level <= 0 || baseCents === 0) return baseCents;
  if (rule.percent) {
    let v = baseCents;
    for (let i = 0; i < level; i++) v = Math.round(v * (1 + rule.percent / 100));
    return v;
  }
  if (rule.amountCents) return baseCents + rule.amountCents * level;
  return baseCents;
}
