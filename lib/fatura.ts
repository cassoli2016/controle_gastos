/**
 * Regras de fatura de cartão: compra até o dia de fechamento pertence à
 * fatura do próprio mês; depois do fechamento, à fatura do mês seguinte
 * (que é o mês em que ela será paga).
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-07-19" + fechamento 5 → "2026-08". Retorna null para data inválida. */
export function faturaMonth(dateISO: string, closingDay: number): string | null {
  const m = ISO_DATE_RE.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  if (day <= closingDay) return `${m[1]}-${m[2]}`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — despesas de texto do bot. */
export function todayISOInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
