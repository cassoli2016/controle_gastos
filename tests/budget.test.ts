import { describe, it, expect } from "vitest";
import { budgetLines } from "@/lib/budget";
import type { EntryView } from "@/lib/calc";

const VIEWS: EntryView[] = [
  { itemName: "Mercado", categoryId: "c-alim", categoryName: "Alimentação", categoryType: "EXPENSE", plannedCents: 40000, paid: true, paidCents: 40000 },
  { itemName: "Padaria", categoryId: "c-alim", categoryName: "Alimentação", categoryType: "EXPENSE", plannedCents: 20000, paid: false, paidCents: null },
  { itemName: "Uber", categoryId: "c-transp", categoryName: "Transporte", categoryType: "EXPENSE", plannedCents: 10000, paid: false, paidCents: null },
  { itemName: "Salário", categoryId: "c-renda", categoryName: "Renda", categoryType: "INCOME", plannedCents: 500000, paid: true, paidCents: 500000 },
];

const CATS = [
  { id: "c-alim", name: "Alimentação", color: "#84cc16", budgetCents: 50000 },
  { id: "c-transp", name: "Transporte", color: "#f59e0b", budgetCents: null },
  { id: "c-lazer", name: "Lazer", color: "#d946ef", budgetCents: 30000 },
];

describe("budgetLines", () => {
  const lines = budgetLines(VIEWS, CATS);

  it("só categorias com meta entram (Transporte sem meta fica de fora)", () => {
    expect(lines.map((l) => l.categoryId)).toEqual(["c-alim", "c-lazer"]);
  });
  it("planejado e pago por categoria", () => {
    const alim = lines[0];
    expect(alim.plannedCents).toBe(60000);
    expect(alim.paidCents).toBe(40000);
    expect(alim.pct).toBe(120); // estourou a meta de 500
  });
  it("categoria com meta e sem gasto aparece zerada", () => {
    const lazer = lines[1];
    expect(lazer.plannedCents).toBe(0);
    expect(lazer.pct).toBe(0);
  });
  it("ordena por pct desc", () => {
    expect(lines[0].pct).toBeGreaterThanOrEqual(lines[1].pct);
  });
});
