import { describe, it, expect } from "vitest";
import { toEntryView } from "@/lib/entries";

describe("toEntryView", () => {
  it("converte lançamento do Prisma em EntryView em centavos", () => {
    const row = {
      plannedAmount: "220.00",
      paid: false,
      paidAmount: null,
      item: { name: "ESTACIONAMENTO", category: { name: "Transporte", type: "EXPENSE" } },
    };
    expect(toEntryView(row as never)).toEqual({
      itemName: "ESTACIONAMENTO",
      categoryName: "Transporte",
      categoryType: "EXPENSE",
      plannedCents: 22000,
      paid: false,
      paidCents: null,
    });
  });

  it("converte lançamento avulso (sem item, com description/category) em EntryView", () => {
    const row = {
      plannedAmount: "350.00",
      paid: true,
      paidAmount: "350.00",
      item: null,
      description: "Notebook Dell (1/10)",
      category: { name: "Eletrônicos", type: "EXPENSE" },
    };
    expect(toEntryView(row as never)).toEqual({
      itemName: "Notebook Dell (1/10)",
      categoryName: "Eletrônicos",
      categoryType: "EXPENSE",
      plannedCents: 35000,
      paid: true,
      paidCents: 35000,
    });
  });
});
