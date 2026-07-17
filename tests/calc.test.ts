import { describe, it, expect } from "vitest";
import {
  plannedIncome, plannedExpense, plannedBalance, remainingToPay,
  expenseRanking, expenseByCategory, type EntryView,
} from "@/lib/calc";

const E: EntryView[] = [
  { itemName: "SALÁRIO", categoryName: "Renda", categoryType: "INCOME", plannedCents: 2500000, paid: true, paidCents: 2500000 },
  { itemName: "YOUTUBE", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 6000, paid: true, paidCents: 6000 },
  { itemName: "ESTACIONAMENTO", categoryName: "Transporte", categoryType: "EXPENSE", plannedCents: 22000, paid: false, paidCents: null },
  { itemName: "PS PLUS", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 59000, paid: false, paidCents: null },
];

describe("calc", () => {
  it("plannedIncome", () => expect(plannedIncome(E)).toBe(2500000));
  it("plannedExpense", () => expect(plannedExpense(E)).toBe(87000));
  it("plannedBalance", () => expect(plannedBalance(E)).toBe(2413000));
  it("remainingToPay soma só despesas não pagas", () => expect(remainingToPay(E)).toBe(81000));
  it("expenseRanking ordena desc", () => {
    expect(expenseRanking(E)).toEqual([
      { itemName: "PS PLUS", cents: 59000 },
      { itemName: "ESTACIONAMENTO", cents: 22000 },
      { itemName: "YOUTUBE", cents: 6000 },
    ]);
  });
  it("expenseByCategory agrega e ordena desc", () => {
    expect(expenseByCategory(E)).toEqual([
      { categoryName: "Assinaturas", cents: 65000 },
      { categoryName: "Transporte", cents: 22000 },
    ]);
  });
});
