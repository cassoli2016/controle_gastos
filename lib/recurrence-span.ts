/** Aritmética pura de prazo de recorrência (sem Prisma: usada também no cliente). */

/** Meses corridos de `start` até `end` (YYYY-MM), ambos inclusos; 0 se end < start. */
export function monthSpan(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

/**
 * Nº de ocorrências de uma recorrência que começa em `start`, repete a cada
 * `interval` meses e termina em `end` (inclusive). Bimestral de 2026-11 a
 * 2029-12 = 19 ocorrências (a última em 2029-11; 2029-12 não cai na cadência).
 */
export function occurrencesUntil(start: string, end: string, interval: number): number {
  const span = monthSpan(start, end);
  if (span === 0) return 0;
  return Math.floor((span - 1) / Math.max(1, interval)) + 1;
}

/** A conta já acabou no mês alvo? (endMonth null = sem prazo). */
export function isPastEnd(endMonth: Date | null | undefined, target: Date): boolean {
  return !!endMonth && target.getTime() > endMonth.getTime();
}

/** Mês (YYYY-MM) da última ocorrência até `end`, na cadência; null se nenhuma. */
export function lastOccurrence(start: string, end: string, interval: number): string | null {
  const n = occurrencesUntil(start, end, interval);
  if (n === 0) return null;
  const [y, m] = start.split("-").map(Number);
  const idx = y * 12 + (m - 1) + (n - 1) * Math.max(1, interval);
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * Lê o mês final como vem do formulário: "2029-12" (input month) ou "12/2029"
 * (Safari no Mac mostra o input month como texto). Devolve YYYY-MM ou o texto
 * original aparado, para a validação recusar com mensagem.
 */
export function normalizeMonthInput(raw: string): string {
  const v = raw.trim();
  const br = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (br) {
    const m = Number(br[1]);
    if (m >= 1 && m <= 12) return `${br[2]}-${String(m).padStart(2, "0")}`;
  }
  return v;
}
