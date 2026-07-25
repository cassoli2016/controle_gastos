/**
 * Regras de fatura de cartão: a compra entra no ciclo que ainda não fechou, e
 * a competência do lançamento é o mês em que esse ciclo VENCE — o mês em que o
 * dinheiro sai. Quando o vencimento cai antes do fechamento no calendário
 * (Bradesco: fecha 27, vence 10), a fatura fechada só é paga no mês seguinte.
 */

import { monthStringFromDate } from "@/lib/dates";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Mês em que a fatura de uma compra será paga.
 * "2026-07-25" + fechamento 27 + vencimento 10 → "2026-08" (fecha 27/07, vence
 * 10/08). Sem vencimento, a competência é o próprio mês do fechamento —
 * comportamento anterior, preservado para cartão que não tem o campo
 * preenchido. Retorna null para data inválida.
 */
export function faturaMonth(dateISO: string, closingDay: number, dueDay?: number | null): string | null {
  const m = ISO_DATE_RE.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Passo 1: qual ciclo captura a compra — o do próprio mês se ela veio até o
  // fechamento, senão o do mês seguinte.
  // Passo 2: em que mês esse ciclo vence — vencimento <= fechamento significa
  // pagar no mês seguinte ao fechamento (uma fatura não fecha e vence no mesmo
  // dia).
  const monthsAhead = (day <= closingDay ? 0 : 1) + (dueDay != null && dueDay <= closingDay ? 1 : 0);
  return monthStringFromDate(new Date(Date.UTC(year, month - 1 + monthsAhead, 1)));
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

/**
 * Mês-alvo de uma cobrança no cartão: com dia de fechamento, a fatura correta
 * pela data (e pelo vencimento); sem fechamento, o mês-fallback informado.
 */
export function cardTargetMonth(
  // id/name opcionais: aceita CardRef inteiro sem brigar com literal freshness.
  card: { closingDay: number | null; dueDay?: number | null; id?: string; name?: string },
  dateISO: string | undefined,
  fallbackMonth: string,
): string {
  if (card.closingDay == null) return fallbackMonth;
  return faturaMonth(dateISO ?? todayISOInSaoPaulo(), card.closingDay, card.dueDay) ?? fallbackMonth;
}

/**
 * N-ésimo dia útil (seg-sex) de um mês "YYYY-MM" → "YYYY-MM-DD".
 * Feriados não são considerados (limitação aceita — salário "5º dia útil").
 */
export function nthBusinessDay(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (d.getUTCMonth() !== m - 1) break;
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) return `${month}-${String(day).padStart(2, "0")}`;
    }
  }
  return `${month}-28`; // inatingível para n<=20, defensivo
}
