import { decimalToCents } from "@/lib/money";
import type { EntryView } from "@/lib/calc";

type PrismaEntryRow = {
  plannedAmount: string | number;
  paid: boolean;
  paidAmount: string | number | null;
  item?: { name: string; category: { name: string; type: "INCOME" | "EXPENSE" } } | null;
  description?: string | null;
  category?: { name: string; type: "INCOME" | "EXPENSE" } | null;
};

export function toEntryView(row: PrismaEntryRow): EntryView {
  const category = row.item?.category ?? row.category;
  return {
    itemName: row.item?.name ?? row.description ?? "—",
    categoryName: category?.name ?? "—",
    categoryType: category?.type ?? "EXPENSE",
    plannedCents: decimalToCents(String(row.plannedAmount)),
    paid: row.paid,
    paidCents: row.paidAmount === null ? null : decimalToCents(String(row.paidAmount)),
  };
}
