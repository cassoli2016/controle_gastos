import { describe, it, expect } from "vitest";
import {
  plannedIncome, plannedExpense, plannedBalance, remainingToPay,
  expenseRanking, expenseByCategory, type EntryView,
} from "@/lib/calc";
import { dailyBudgetEntryView } from "@/lib/entries";
import { dailyBudgetLine } from "@/lib/daily-budget";

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

describe("reserva do dia a dia nos cálculos do mês", () => {
  // 6 dias restantes × R$ 100 = R$ 600,00
  const reserva = dailyBudgetEntryView(dailyBudgetLine("2026-07", "2026-07-26", 10000));
  const comReserva: EntryView[] = [...E, reserva];

  it("conta como despesa não paga", () => {
    expect(reserva).toMatchObject({ plannedCents: 60000, paid: false, paidCents: null, categoryType: "EXPENSE" });
  });
  it("entra em plannedExpense", () => {
    expect(plannedExpense(comReserva)).toBe(87000 + 60000);
  });
  it("piora o saldo", () => {
    expect(plannedBalance(comReserva)).toBe(2413000 - 60000);
  });
  it("entra em remainingToPay, porque nunca está paga", () => {
    expect(remainingToPay(comReserva)).toBe(81000 + 60000);
  });
  it("aparece na categoria própria e no ranking", () => {
    // Busca por nome, não por posição: "Assinaturas" soma 65.000 nesta fixture
    // e fica à frente da reserva (60.000) na ordenação por categoria.
    expect(expenseByCategory(comReserva).find((c) => c.categoryName === "Reserva do dia a dia")).toEqual({
      categoryName: "Reserva do dia a dia",
      cents: 60000,
    });
    // No ranking por ITEM ela é a maior — PS PLUS sozinho é 59.000.
    expect(expenseRanking(comReserva)[0]).toEqual({ itemName: "Reserva do dia a dia", cents: 60000 });
  });
  it("mês passado não muda nada", () => {
    const passado = dailyBudgetEntryView(dailyBudgetLine("2026-06", "2026-07-26", 10000));
    expect(plannedExpense([...E, passado])).toBe(87000);
  });
});
