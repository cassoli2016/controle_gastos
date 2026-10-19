import { describe, it, expect } from "vitest";
import { reserveOutlook } from "@/lib/planning";
import type { EntryView } from "@/lib/calc";

const receita = (cents: number): EntryView =>
  ({ itemName: "Salário", categoryId: "i", categoryName: "Recebimentos", categoryType: "INCOME", plannedCents: cents, paid: false, paidCents: null });
const despesa = (cents: number): EntryView =>
  ({ itemName: "Conta", categoryId: "d", categoryName: "Contas", categoryType: "EXPENSE", plannedCents: cents, paid: false, paidCents: null });

/** Mês com saldo de `n` centavos. */
const mes = (n: number): EntryView[] => (n >= 0 ? [receita(n)] : [despesa(-n)]);

describe("reserveOutlook — curva projetada das reservas", () => {
  it("a sobra de um mês entra nas reservas do mês seguinte", () => {
    const o = reserveOutlook(100_000, new Map([["2026-10", mes(50_000)], ["2026-11", mes(-20_000)]]));
    expect(o.curve.map((p) => p.reservesCents)).toEqual([150_000, 130_000]);
  });

  it("sobra NÃO abate buraco de mês ANTERIOR — dinheiro não anda para trás", () => {
    // O buraco de outubro tem que ser coberto pelo que existe ANTES dele.
    // A sobra de novembro chega tarde demais.
    const o = reserveOutlook(10_000, new Map([["2026-10", mes(-50_000)], ["2026-11", mes(90_000)]]));
    expect(o.lowMonth).toBe("2026-10");
    expect(o.lowCents).toBe(-40_000);
    expect(o.curve[1].reservesCents).toBe(50_000);
  });

  it("curva que nunca desce abaixo de hoje: não há pior momento", () => {
    const o = reserveOutlook(25_000, new Map([["2026-10", mes(1_000)], ["2026-11", mes(2_000)]]));
    expect(o.lowMonth).toBeNull();
    expect(o.lowCents).toBe(25_000);
  });

  it("o caso real: sobra grande em outubro segura os três meses magros", () => {
    const o = reserveOutlook(2_540_907, new Map([
      ["2026-10", mes(1_558_290)],
      ["2026-11", mes(-804_034)],
      ["2026-12", mes(-132_397)],
      ["2027-01", mes(-90_806)],
      ["2027-02", mes(88_348)],
    ]));
    expect(o.lowMonth).toBeNull(); // nunca desce abaixo do saldo de hoje
    expect(o.curve[3].reservesCents).toBe(3_071_960); // jan/27: o fundo do poço
  });

  it("empate no mínimo fica com o PRIMEIRO mês — é quando o aperto começa", () => {
    const o = reserveOutlook(10_000, new Map([["2026-10", mes(-5_000)], ["2026-11", mes(0)], ["2026-12", mes(1_000)]]));
    expect(o.lowMonth).toBe("2026-10");
    expect(o.lowCents).toBe(5_000);
  });

  it("reservas insuficientes: o mínimo fica negativo", () => {
    const o = reserveOutlook(10_000, new Map([["2026-10", mes(-30_000)]]));
    expect(o.lowCents).toBe(-20_000);
    expect(o.lowMonth).toBe("2026-10");
  });

  it("sem meses, a curva é vazia e o piso é o saldo de hoje", () => {
    const o = reserveOutlook(7_000, new Map());
    expect(o.curve).toEqual([]);
    expect(o.lowMonth).toBeNull();
    expect(o.lowCents).toBe(7_000);
  });
});
