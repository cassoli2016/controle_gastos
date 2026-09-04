import { describe, it, expect } from "vitest";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { dailyBudgetLine } from "@/lib/daily-budget";

describe("toEntryView", () => {
  it("converte lançamento do Prisma em EntryView em centavos", () => {
    const row = {
      plannedAmount: "220.00",
      paid: false,
      paidAmount: null,
      item: { name: "ESTACIONAMENTO", category: { id: "cat-transp", name: "Transporte", type: "EXPENSE" } },
    };
    expect(toEntryView(row as never)).toEqual({
      itemName: "ESTACIONAMENTO",
      categoryId: "cat-transp",
      categoryName: "Transporte",
      categoryType: "EXPENSE",
      plannedCents: 22000,
      paid: false,
      paidCents: null,
      isTransfer: false,
    });
  });

  it("converte lançamento avulso (sem item, com description/category) em EntryView", () => {
    const row = {
      plannedAmount: "350.00",
      paid: true,
      paidAmount: "350.00",
      item: null,
      description: "Notebook Dell (1/10)",
      category: { id: "cat-eletro", name: "Eletrônicos", type: "EXPENSE" },
    };
    expect(toEntryView(row as never)).toEqual({
      itemName: "Notebook Dell (1/10)",
      categoryId: "cat-eletro",
      categoryName: "Eletrônicos",
      categoryType: "EXPENSE",
      plannedCents: 35000,
      paid: true,
      paidCents: 35000,
      isTransfer: false,
    });
  });
});

describe("toEntryView e transferências", () => {
  it("propaga isTransfer da categoria do item", () => {
    const row = {
      plannedAmount: "16118.64",
      paid: true,
      paidAmount: "16118.64",
      item: null,
      description: "Depósito · Cristian Cassoli",
      category: { id: "cat-reserva", name: "Reserva", type: "EXPENSE", isTransfer: true },
    };
    expect(toEntryView(row as never).isTransfer).toBe(true);
  });

  it("categoria comum não é transferência", () => {
    const row = {
      plannedAmount: "220.00",
      paid: false,
      paidAmount: null,
      item: { name: "Diarista", category: { id: "cat-moradia", name: "Moradia", type: "EXPENSE", isTransfer: false } },
    };
    expect(toEntryView(row as never).isTransfer).toBe(false);
  });

  it("lançamento sem categoria nenhuma não é transferência", () => {
    const row = { plannedAmount: "10.00", paid: false, paidAmount: null, item: null, description: "Solto", category: null };
    expect(toEntryView(row as never).isTransfer).toBe(false);
  });

  it("a reserva do dia a dia é despesa de verdade, não transferência", () => {
    // Ela sai da conta e some no dia a dia; não vira saldo em caixinha nenhuma.
    expect(dailyBudgetEntryView(dailyBudgetLine("2026-09", "2026-09-04", 10000)).isTransfer).toBe(false);
  });
});
