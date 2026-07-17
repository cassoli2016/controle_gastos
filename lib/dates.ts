export function monthToDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
export function monthStringFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
export function formatCompetencia(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Lista "YYYY-MM" inclusiva de `from` até `to`. Vazio se `to` < `from`. */
export function monthRange(from: string, to: string): string[] {
  const start = monthToDate(from);
  const end = monthToDate(to);
  if (end.getTime() < start.getTime()) return [];
  const result: string[] = [];
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    result.push(monthStringFromDate(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return result;
}
