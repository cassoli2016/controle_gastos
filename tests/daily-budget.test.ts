import { describe, it, expect } from "vitest";
import { dailyBudget, daysInMonth, dailyBudgetLine, DAILY_BUDGET_LINE } from "@/lib/daily-budget";

const norm = (s: string) => s.replace(/[  ]/g, " ");

const CEM = 10000; // R$ 100,00 por dia, em centavos

describe("daysInMonth", () => {
  it("meses de 31, 30 e 28 dias", () => {
    expect(daysInMonth("2026-07")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
    expect(daysInMonth("2027-02")).toBe(28);
  });
  it("fevereiro de ano bissexto", () => {
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("dailyBudget no mês corrente", () => {
  it("primeiro dia reserva o mês cheio", () => {
    expect(dailyBudget("2026-07", "2026-07-01", CEM)).toMatchObject({
      daysInMonth: 31,
      daysRemaining: 31,
      monthTotalCents: 310000,
      remainingCents: 310000,
    });
  });
  it("dia 26 de um mês de 31 dias deixa 6 dias (hoje conta)", () => {
    expect(dailyBudget("2026-07", "2026-07-26", CEM)).toMatchObject({
      daysRemaining: 6,
      remainingCents: 60000,
    });
  });
  it("último dia do mês deixa exatamente um dia", () => {
    expect(dailyBudget("2026-07", "2026-07-31", CEM)).toMatchObject({
      daysRemaining: 1,
      remainingCents: 10000,
    });
  });
  it("fevereiro bissexto no dia 1", () => {
    expect(dailyBudget("2028-02", "2028-02-01", CEM)).toMatchObject({
      daysInMonth: 29,
      daysRemaining: 29,
      remainingCents: 290000,
    });
  });
});

describe("dailyBudget em outros meses", () => {
  it("mês futuro reserva o mês cheio (nada consumido)", () => {
    expect(dailyBudget("2026-08", "2026-07-26", CEM)).toMatchObject({
      daysInMonth: 31,
      daysRemaining: 31,
      remainingCents: 310000,
    });
  });
  it("mês futuro do ano seguinte", () => {
    expect(dailyBudget("2027-01", "2026-12-31", CEM)).toMatchObject({
      daysRemaining: 31,
      remainingCents: 310000,
    });
  });
  it("mês passado não deixa nada", () => {
    expect(dailyBudget("2026-06", "2026-07-26", CEM)).toMatchObject({
      daysInMonth: 30,
      daysRemaining: 0,
      monthTotalCents: 300000,
      remainingCents: 0,
    });
  });
  it("mês passado do ano anterior", () => {
    expect(dailyBudget("2026-12", "2027-01-05", CEM)).toMatchObject({
      daysRemaining: 0,
      remainingCents: 0,
    });
  });
});

describe("dailyBudget com outro valor por dia", () => {
  it("o valor por dia é respeitado e devolvido", () => {
    expect(dailyBudget("2026-04", "2026-04-10", 5050)).toMatchObject({
      perDayCents: 5050,
      daysInMonth: 30,
      daysRemaining: 21,
      monthTotalCents: 151500,
      remainingCents: 106050,
    });
  });
});

describe("dailyBudgetLine", () => {
  it("mês corrente: valor é o restante, com hint explicando", () => {
    const l = dailyBudgetLine("2026-07", "2026-07-26", CEM);
    expect(l).toMatchObject({
      line: DAILY_BUDGET_LINE,
      categoryName: DAILY_BUDGET_LINE,
      categoryType: "EXPENSE",
      cents: 60000,
      daysRemaining: 6,
      daysInMonth: 31,
      perDayCents: CEM,
    });
    expect(norm(l.hint)).toBe("6 de 31 dias · R$ 100,00/dia");
  });

  it("mês futuro: mês cheio", () => {
    const l = dailyBudgetLine("2026-08", "2026-07-26", CEM);
    expect(l).toMatchObject({ cents: 310000, daysRemaining: 31, daysInMonth: 31 });
    expect(norm(l.hint)).toBe("31 de 31 dias · R$ 100,00/dia");
  });

  it("mês passado: zero, mas a linha existe", () => {
    const l = dailyBudgetLine("2026-06", "2026-07-26", CEM);
    expect(l).toMatchObject({ cents: 0, daysRemaining: 0, daysInMonth: 30 });
    expect(norm(l.hint)).toBe("0 de 30 dias · R$ 100,00/dia");
  });

  it("fevereiro de 28 e de 29 dias", () => {
    expect(dailyBudgetLine("2027-02", "2027-02-01", CEM)).toMatchObject({ cents: 280000, daysInMonth: 28 });
    expect(dailyBudgetLine("2028-02", "2028-02-01", CEM)).toMatchObject({ cents: 290000, daysInMonth: 29 });
  });

  it("outro valor por dia entra no hint", () => {
    expect(norm(dailyBudgetLine("2026-08", "2026-07-26", 5050).hint)).toBe("31 de 31 dias · R$ 50,50/dia");
  });
});
