import { monthToDate, monthStringFromDate } from "@/lib/dates";

/** "2026-08" + delta em meses → "2026-09" (delta negativo volta). */
export function shiftMonth(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** "2026-08" → "Agosto 2026" (pt-BR, capitalizado). */
export function monthLabel(month: string): string {
  const d = monthToDate(month);
  const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(d);
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} ${d.getUTCFullYear()}`;
}

/** Os 12 meses do ano, para a grade do seletor. */
export function monthGrid(year: number): { monthISO: string; short: string }[] {
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => {
    const monthISO = `${year}-${String(i + 1).padStart(2, "0")}`;
    // Intl devolve "ago." em algumas versões: tira o ponto e deixa minúsculo.
    const short = fmt.format(monthToDate(monthISO)).replace(".", "").toLowerCase();
    return { monthISO, short };
  });
}
