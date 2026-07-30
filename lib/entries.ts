import { decimalToCents } from "@/lib/money";
import type { EntryView } from "@/lib/calc";
import { DAILY_BUDGET_ENTRY_ID, type DailyBudgetLine } from "@/lib/daily-budget";

type PrismaEntryRow = {
  plannedAmount: string | number;
  paid: boolean;
  paidAmount: string | number | null;
  item?: { name: string; category: { id: string; name: string; type: "INCOME" | "EXPENSE" } } | null;
  description?: string | null;
  category?: { id: string; name: string; type: "INCOME" | "EXPENSE" } | null;
};

export function toEntryView(row: PrismaEntryRow): EntryView {
  const category = row.item?.category ?? row.category;
  return {
    itemName: row.item?.name ?? row.description ?? "—",
    categoryId: category?.id ?? "sem-categoria",
    categoryName: category?.name ?? "—",
    categoryType: category?.type ?? "EXPENSE",
    plannedCents: decimalToCents(String(row.plannedAmount)),
    paid: row.paid,
    paidCents: row.paidAmount === null ? null : decimalToCents(String(row.paidAmount)),
  };
}

/**
 * Linha derivada da reserva na forma que `lib/calc.ts` consome. Nunca paga: o
 * valor cai pelo calendário, não por baixa.
 */
export function dailyBudgetEntryView(line: DailyBudgetLine): EntryView {
  return {
    itemName: line.line,
    // Id sintético estável: não há Category no banco por trás da reserva.
    categoryId: DAILY_BUDGET_ENTRY_ID,
    categoryName: line.categoryName,
    categoryType: line.categoryType,
    plannedCents: line.cents,
    paid: false,
    paidCents: null,
  };
}
