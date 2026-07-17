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
