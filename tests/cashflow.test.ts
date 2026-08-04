import { describe, it, expect } from "vitest";
import { dailyCashflow, type CashflowRow } from "@/lib/cashflow";

const base = { paid: false, paidCents: null, paidDate: null, dueDay: null, purchaseDate: null };
const income = (over: Partial<CashflowRow>): CashflowRow => ({ ...base, categoryType: "INCOME", plannedCents: 0, ...over });
const expense = (over: Partial<CashflowRow>): CashflowRow => ({ ...base, categoryType: "EXPENSE", plannedCents: 0, ...over });

describe("dailyCashflow", () => {
  it("acumula receitas e despesas pelos vencimentos", () => {
    const { days, verdict } = dailyCashflow(
      [income({ plannedCents: 100_00, dueDay: 5 }), expense({ plannedCents: 40_00, dueDay: 10 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(days).toHaveLength(31);
    expect(days[3].cumulativeCents).toBe(0);
    expect(days[4].cumulativeCents).toBe(100_00);
    expect(days[9].cumulativeCents).toBe(60_00);
    expect(days[30].cumulativeCents).toBe(60_00);
    expect(verdict).toEqual({ alwaysPositive: true });
  });

  it("fica negativo quando a despesa vence antes da receita", () => {
    const { verdict } = dailyCashflow(
      [expense({ plannedCents: 50_00, dueDay: 3 }), income({ plannedCents: 100_00, dueDay: 20 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdict).toEqual({
      alwaysPositive: false,
      firstNegativeDay: 3,
      lastNegativeDay: 19,
      minCents: -50_00,
      minDay: 3,
    });
  });

  it("pago entra na data real com o valor real", () => {
    const { days } = dailyCashflow(
      [expense({ plannedCents: 100_00, dueDay: 20, paid: true, paidCents: 90_00, paidDate: new Date("2026-08-02T00:00:00Z") })],
      "2026-08",
      "2026-08-15",
      null,
    );
    expect(days[1].outCents).toBe(90_00);
    expect(days[19].outCents).toBe(0);
  });

  it("pago fora do mês de competência encosta na borda", () => {
    const { days } = dailyCashflow(
      [
        expense({ plannedCents: 10_00, paid: true, paidCents: 10_00, paidDate: new Date("2026-07-28T00:00:00Z"), dueDay: 10 }),
        income({ plannedCents: 20_00, paid: true, paidCents: 20_00, paidDate: new Date("2026-09-02T00:00:00Z"), dueDay: 15 }),
      ],
      "2026-08",
      "2026-08-15",
      null,
    );
    expect(days[0].outCents).toBe(10_00);
    expect(days[30].inCents).toBe(20_00);
  });

  it("sem data é pessimista: despesa no dia 1, receita no último", () => {
    const { days } = dailyCashflow([expense({ plannedCents: 30_00 }), income({ plannedCents: 80_00 })], "2026-08", "2026-08-01", null);
    expect(days[0].outCents).toBe(30_00);
    expect(days[30].inCents).toBe(80_00);
  });

  it("avulso em aberto usa o dia da compra", () => {
    const { days } = dailyCashflow(
      [expense({ plannedCents: 25_00, purchaseDate: new Date("2026-08-12T00:00:00Z") })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(days[11].outCents).toBe(25_00);
  });

  it("dueDay maior que o mês encosta no último dia", () => {
    const { days } = dailyCashflow([expense({ plannedCents: 10_00, dueDay: 31 })], "2026-02", "2026-01-01", null);
    expect(days).toHaveLength(28);
    expect(days[27].outCents).toBe(10_00);
  });

  it("reserva do dia a dia dilui por dia coberto", () => {
    const r1 = dailyCashflow([], "2026-08", "2026-08-30", { perDayCents: 100_00 });
    expect(r1.days[28].outCents).toBe(0);
    expect(r1.days[29].outCents).toBe(100_00);
    expect(r1.days[30].outCents).toBe(100_00);
    const r2 = dailyCashflow([], "2026-09", "2026-08-30", { perDayCents: 100_00 });
    expect(r2.days.every((d) => d.outCents === 100_00)).toBe(true);
    const r3 = dailyCashflow([], "2026-07", "2026-08-30", { perDayCents: 100_00 });
    expect(r3.days.every((d) => d.outCents === 0)).toBe(true);
  });
});
