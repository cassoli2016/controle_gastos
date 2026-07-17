import { decimalToCents } from "@/lib/money";
import type { EntryView } from "@/lib/calc";

type PrismaEntryRow = {
  plannedAmount: string | number;
  paid: boolean;
  paidAmount: string | number | null;
  item: { name: string; category: { name: string; type: "INCOME" | "EXPENSE" } };
};

export function toEntryView(row: PrismaEntryRow): EntryView {
  return {
    itemName: row.item.name,
    categoryName: row.item.category.name,
    categoryType: row.item.category.type,
    plannedCents: decimalToCents(String(row.plannedAmount)),
    paid: row.paid,
    paidCents: row.paidAmount === null ? null : decimalToCents(String(row.paidAmount)),
  };
}
