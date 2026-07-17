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
});
