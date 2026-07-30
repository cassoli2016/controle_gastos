import { sumCents } from "@/lib/money";

export type EntryView = {
  itemName: string;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
};

const income = (e: EntryView[]) => e.filter((x) => x.categoryType === "INCOME");
const expense = (e: EntryView[]) => e.filter((x) => x.categoryType === "EXPENSE");

export function plannedIncome(e: EntryView[]): number {
  return sumCents(income(e).map((x) => x.plannedCents));
}
export function plannedExpense(e: EntryView[]): number {
  return sumCents(expense(e).map((x) => x.plannedCents));
}
export function plannedBalance(e: EntryView[]): number {
  return plannedIncome(e) - plannedExpense(e);
}
/** Soma dos previstos de despesas ainda não pagas. */
export function remainingToPay(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => !x.paid).map((x) => x.plannedCents));
}
/** Soma dos previstos de despesas já pagas (complemento de remainingToPay). */
export function paidExpense(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/** Soma dos previstos de receitas já recebidas. */
export function receivedIncome(e: EntryView[]): number {
  return sumCents(income(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/** Percentual inteiro 0–100 (clampado); total <= 0 → 0, sem divisão por zero. */
export function progressPct(paidCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((paidCents / totalCents) * 100)));
}
/**
 * Despesa não paga está atrasada quando o mês já passou, ou quando é o mês
 * corrente e o dia de vencimento ficou para trás. Receita, linha paga e mês
 * futuro nunca atrasam; sem dueDay, só o mês passado conta.
 * "YYYY-MM" compara lexicograficamente na ordem cronológica.
 */
export function isOverdue(
  row: { paid: boolean; categoryType: "INCOME" | "EXPENSE"; dueDay: number | null },
  month: string,
  todayISO: string,
): boolean {
  if (row.paid || row.categoryType === "INCOME") return false;
  const todayMonth = todayISO.slice(0, 7);
  if (month < todayMonth) return true;
  if (month > todayMonth) return false;
  return row.dueDay !== null && row.dueDay < Number(todayISO.slice(8, 10));
}
export function expenseRanking(e: EntryView[]): { itemName: string; cents: number }[] {
  return expense(e)
    .map((x) => ({ itemName: x.itemName, cents: x.plannedCents }))
    .sort((a, b) => b.cents - a.cents);
}
export function expenseByCategory(e: EntryView[]): { categoryName: string; cents: number }[] {
  const map = new Map<string, number>();
  for (const x of expense(e)) map.set(x.categoryName, (map.get(x.categoryName) ?? 0) + x.plannedCents);
  return [...map.entries()]
    .map(([categoryName, cents]) => ({ categoryName, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export type CategoryGroup<T> = {
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  rows: T[];
  subtotalCents: number;
};

/**
 * Agrupa linhas por categoria e soma subtotais (em centavos).
 * Ordena: INCOME antes de EXPENSE; dentro do mesmo tipo, subtotal desc.
 * Não muta o array de entrada.
 */
export function groupByCategory<
  T extends { categoryName: string; categoryType: "INCOME" | "EXPENSE"; plannedCents: number },
>(rows: T[]): CategoryGroup<T>[] {
  const map = new Map<string, CategoryGroup<T>>();
  for (const row of rows) {
    const key = `${row.categoryType}:${row.categoryName}`;
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(key, {
        categoryName: row.categoryName,
        categoryType: row.categoryType,
        rows: [row],
        subtotalCents: 0,
      });
    }
  }
  const groups = [...map.values()].map((g) => ({
    ...g,
    subtotalCents: sumCents(g.rows.map((r) => r.plannedCents)),
  }));
  return groups.sort((a, b) => {
    if (a.categoryType !== b.categoryType) return a.categoryType === "INCOME" ? -1 : 1;
    return b.subtotalCents - a.subtotalCents;
  });
}
