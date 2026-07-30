import { describe, it, expect } from "vitest";
import {
  plannedIncome, plannedExpense, plannedBalance, remainingToPay,
  paidExpense, receivedIncome, progressPct, isOverdue,
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

describe("progresso de pagamento", () => {
  it("paidExpense soma só despesas pagas", () => expect(paidExpense(E)).toBe(6000));
  it("paidExpense é o complemento de remainingToPay", () =>
    expect(paidExpense(E) + remainingToPay(E)).toBe(plannedExpense(E)));
  it("receivedIncome soma só receitas pagas", () => expect(receivedIncome(E)).toBe(2500000));
  it("progressPct arredonda para inteiro", () => {
    expect(progressPct(6000, 87000)).toBe(7);
    expect(progressPct(66000, 115000)).toBe(57);
  });
  it("progressPct com total 0 → 0 (sem divisão por zero)", () => {
    expect(progressPct(0, 0)).toBe(0);
    expect(progressPct(500, 0)).toBe(0);
  });
  it("progressPct nunca passa de 100", () => expect(progressPct(200, 100)).toBe(100));
});

describe("isOverdue", () => {
  const base = { paid: false, categoryType: "EXPENSE" as const, dueDay: 10 };
  it("mês corrente, vencimento já passou → atrasada", () =>
    expect(isOverdue(base, "2026-07", "2026-07-30")).toBe(true));
  it("mês corrente, vence hoje → não atrasada", () =>
    expect(isOverdue({ ...base, dueDay: 30 }, "2026-07", "2026-07-30")).toBe(false));
  it("mês passado, não paga → atrasada mesmo sem dueDay", () =>
    expect(isOverdue({ ...base, dueDay: null }, "2026-06", "2026-07-30")).toBe(true));
  it("mês futuro nunca atrasa", () =>
    expect(isOverdue(base, "2026-08", "2026-07-30")).toBe(false));
  it("paga não atrasa", () =>
    expect(isOverdue({ ...base, paid: true }, "2026-07", "2026-07-30")).toBe(false));
  it("receita não atrasa", () =>
    expect(isOverdue({ ...base, categoryType: "INCOME" as const }, "2026-07", "2026-07-30")).toBe(false));
  it("mês corrente sem dueDay não atrasa", () =>
    expect(isOverdue({ ...base, dueDay: null }, "2026-07", "2026-07-30")).toBe(false));
});
