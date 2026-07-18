import { monthRange } from "@/lib/dates";

/** Gera a lista de competências ("YYYY-MM") de um parcelamento, a partir do mês inicial. */
export function installmentMonths(startMonth: string, count: number): string[] {
  if (count < 1) return [];
  const [y, m] = startMonth.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + (count - 1), 1));
  const endMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthRange(startMonth, endMonth);
}
