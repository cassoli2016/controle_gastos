import { describe, it, expect } from "vitest";
import { dailyBudget, daysInMonth } from "@/lib/daily-budget";

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
