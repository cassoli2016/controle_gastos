import { describe, it, expect } from "vitest";
import { groupByCategory } from "@/lib/calc";

const rows = [
  { categoryName: "Renda", categoryType: "INCOME" as const, plannedCents: 2500000 },
  { categoryName: "Assinaturas", categoryType: "EXPENSE" as const, plannedCents: 6000 },
  { categoryName: "Assinaturas", categoryType: "EXPENSE" as const, plannedCents: 59000 },
  { categoryName: "Transporte", categoryType: "EXPENSE" as const, plannedCents: 22000 },
];

describe("groupByCategory", () => {
  it("agrupa, soma subtotais e ordena (income primeiro, depois subtotal desc)", () => {
    const g = groupByCategory(rows);
    expect(g.map((x) => x.categoryName)).toEqual(["Renda", "Assinaturas", "Transporte"]);
    expect(g[0].subtotalCents).toBe(2500000);
    expect(g[1].subtotalCents).toBe(65000);
    expect(g[1].rows.length).toBe(2);
  });
});
