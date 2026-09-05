import { decimalToCents } from "@/lib/money";
import type { EntryView } from "@/lib/calc";
import { DAILY_BUDGET_ENTRY_ID, type DailyBudgetLine } from "@/lib/daily-budget";
import {
  CARD_ESTIMATE_CATEGORY,
  CARD_ESTIMATE_ENTRY_PREFIX,
  type CardEstimateLine,
} from "@/lib/card-estimate";

type PrismaCategory = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  // Categorias antigas (e fixtures de teste) podem não trazer o campo: sem
  // marcação explícita, o lançamento é ganho/gasto de verdade.
  isTransfer?: boolean;
};

type PrismaEntryRow = {
  // `unknown` porque o Prisma entrega Decimal e a conversão é feita aqui com
  // String(...) — exigir string|number obrigaria todo chamador a converter antes.
  plannedAmount: unknown;
  paid: boolean;
  paidAmount: unknown;
  item?: { name: string; category: PrismaCategory } | null;
  description?: string | null;
  category?: PrismaCategory | null;
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
    paidCents: row.paidAmount == null ? null : decimalToCents(String(row.paidAmount)),
    isTransfer: category?.isTransfer === true,
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
    // Sai da conta e some no dia a dia — não vira saldo em caixinha nenhuma.
    isTransfer: false,
  };
}

/**
 * Linha derivada da provisão de compras no cartão, na forma que `lib/calc.ts`
 * consome. Nunca paga: é estimativa do que ainda vai ser comprado, e some
 * sozinha quando a fatura real chega (ver lib/card-estimate.ts).
 */
export function cardEstimateEntryView(line: CardEstimateLine): EntryView {
  return {
    itemName: line.line,
    // Id sintético por cartão: não há Category no banco por trás da provisão,
    // e cartões diferentes não podem cair na mesma fatia da pizza.
    categoryId: `${CARD_ESTIMATE_ENTRY_PREFIX}${line.cardId}`,
    categoryName: CARD_ESTIMATE_CATEGORY,
    categoryType: "EXPENSE",
    plannedCents: line.cents,
    paid: false,
    paidCents: null,
    isTransfer: false,
  };
}
