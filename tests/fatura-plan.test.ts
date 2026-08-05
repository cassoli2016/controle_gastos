import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faturaPlanStates, expectedTail } from "@/lib/fatura-plan";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import type { FaturaLine } from "@/lib/fatura-core";
import type { AppRow } from "@/lib/fatura-match";

function inv(description: string, cents: number, seq: number, count: number): FaturaLine {
  return { dateISO: "2026-07-05", description, cents, kind: "purchase", installment: { seq, count } };
}

describe("faturaPlanStates", () => {
  it("chargedThrough é a maior parcela cobrada", () => {
    const states = faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []);
    const s = [...states.values()][0];
    expect(s.chargedThrough).toBe(3);
    expect(s.count).toBe(6);
    expect(s.cents).toBe(92820);
  });

  it("quitação antecipada: chargedThrough vai até o fim", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const s = [...faturaPlanStates(lines, []).values()][0];
    expect(s.chargedThrough).toBe(10);
  });

  it("parcela órfã: o plano fica cobrado até a anterior (deslocamento)", () => {
    // A fatura não trouxe 3/6; o app tinha. Então o banco cobrou até a 2.
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const s = [...faturaPlanStates([], [orphan]).values()][0];
    expect(s.chargedThrough).toBe(2);
    expect(s.count).toBe(6);
  });

  it("órfã à vista não cria plano", () => {
    const orphan: AppRow = { id: "x", description: "Es Estacionamento", cents: 23000, installment: null };
    expect(faturaPlanStates([], [orphan]).size).toBe(0);
  });

  it("a fatura ganha da órfã quando as duas conhecem o plano", () => {
    const line = inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6);
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const s = [...faturaPlanStates([line], [orphan]).values()][0];
    expect(s.chargedThrough).toBe(3);
  });

  it("separa planos da mesma loja por valor da parcela", () => {
    const states = faturaPlanStates(
      [inv("Franciscana - Parcela 8/12", 1799, 8, 12), inv("Franciscana - Parcela 9/9", 3088, 9, 9)],
      [],
    );
    expect(states.size).toBe(2);
  });
});

describe("expectedTail", () => {
  it("projeta chargedThrough+1..count nos meses seguintes", () => {
    const [state] = [...faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []).values()];
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 4 },
      { month: "2026-10", seq: 5 },
      { month: "2026-11", seq: 6 },
    ]);
  });

  it("plano quitado tem cauda vazia", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const [state] = [...faturaPlanStates(lines, []).values()];
    expect(expectedTail(state, "2026-08")).toEqual([]);
  });

  it("parcela atrasada desloca: a cauda recomeça na parcela não cobrada", () => {
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const [state] = [...faturaPlanStates([], [orphan]).values()];
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 3 },
      { month: "2026-10", seq: 4 },
      { month: "2026-11", seq: 5 },
      { month: "2026-12", seq: 6 },
    ]);
  });

  it("vira o ano", () => {
    const [state] = [...faturaPlanStates([inv("Loja - Parcela 1/3", 1000, 1, 3)], []).values()];
    expect(expectedTail(state, "2026-11").map((t) => t.month)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("faturaPlanStates — fatura real", () => {
  const text = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");
  const f = parseNubankFatura(text);
  if ("error" in f) throw new Error(f.error);

  it("77 planos distintos", () => {
    expect(faturaPlanStates(f.lines, []).size).toBe(77);
  });

  it("a cauda total bate com a projeção validada", () => {
    const states = faturaPlanStates(f.lines, []);
    const total = [...states.values()].reduce((a, s) => a + expectedTail(s, f.faturaMonth).length * s.cents, 0);
    expect(total).toBe(2002897);
  });
});
