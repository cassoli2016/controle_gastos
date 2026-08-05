import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faturaPlanStates, expectedTail, reconcileTail, type TailAction } from "@/lib/fatura-plan";
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

function mabuState() {
  return faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []);
}
function row(id: string, description: string, cents: number, seq?: number, count?: number): AppRow {
  return { id, description, cents, installment: seq && count ? { seq, count } : null };
}

describe("reconcileTail", () => {
  it("insere a cauda que falta", () => {
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: new Map() });
    expect(actions.filter((a) => a.kind === "insert")).toHaveLength(3);
    const set = actions.find((a) => a.kind === "insert" && a.month === "2026-09") as Extract<
      TailAction,
      { kind: "insert" }
    >;
    expect(set.seq).toBe(4);
    expect(set.cents).toBe(92820);
    expect(set.description).toBe("Mabu Hotel - Parcela 4/6");
  });

  it("não duplica o que já está certo", () => {
    const existing = new Map([["2026-09", [row("a", "Mabu Hotel - Parcela 4/6", 92820, 4, 6)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "insert" && a.month === "2026-09")).toBe(false);
    expect(actions.some((a) => a.kind === "delete" && a.id === "a")).toBe(false);
  });

  it("apaga parcela do plano fora da cauda — é a dívida do PR #29", () => {
    // Plano quitado antecipadamente: cauda vazia, mas o app ainda tem a parcela.
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const existing = new Map([["2026-09", [row("velha", "Nescafe - Parcela 3/10", 3380, 3, 10)]]]);
    const actions = reconcileTail({
      states: faturaPlanStates(lines, []),
      faturaMonth: "2026-08",
      existingByMonth: existing,
    });
    expect(actions).toEqual([{ kind: "delete", id: "velha" }]);
  });

  it("move a parcela para o mês certo quando o plano desloca", () => {
    const orphan = row("x", "Mabu Hotel - Parcela 3/6", 92820, 3, 6);
    const existing = new Map([["2026-09", [row("a", "Mabu Hotel - Parcela 4/6", 92820, 4, 6)]]]);
    const actions = reconcileTail({
      states: faturaPlanStates([], [orphan]),
      faturaMonth: "2026-08",
      existingByMonth: existing,
    });
    // Setembro tinha a 4 e agora tem que ter a 3: apaga a 4, insere a 3.
    expect(actions).toContainEqual({ kind: "delete", id: "a" });
    const ins = actions.filter((a) => a.kind === "insert") as Extract<TailAction, { kind: "insert" }>[];
    expect(ins.map((i) => `${i.month}:${i.seq}`)).toEqual(["2026-09:3", "2026-10:4", "2026-11:5", "2026-12:6"]);
  });

  it("PRESERVA compra à vista em mês futuro", () => {
    // Regressão dos R$ 941,04: as compras do ciclo novo não podem sair.
    const existing = new Map([["2026-09", [row("vista", "Es Estacionamento", 23000)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "delete")).toBe(false);
  });

  it("PRESERVA plano que a fatura não conhece", () => {
    // Compra parcelada feita DEPOIS do fechamento: a fatura fechada não a lista.
    const existing = new Map([["2026-09", [row("nova", "Loja Nova - Parcela 1/5", 5000, 1, 5)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "delete" && a.id === "nova")).toBe(false);
  });

  it("não mexe no mês da fatura (é o replace que manda lá)", () => {
    const existing = new Map([["2026-08", [row("a", "Mabu Hotel - Parcela 3/6", 92820, 3, 6)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "delete" && a.id === "a")).toBe(false);
  });

  it("corrige valor divergente da parcela", () => {
    const existing = new Map([["2026-09", [row("a", "Mabu Hotel - Parcela 4/6", 92800, 4, 6)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    // Valor diferente ⇒ chave de plano diferente ⇒ a linha antiga não pertence
    // ao plano da fatura e sobrevive; a correta é inserida.
    expect(actions.some((a) => a.kind === "insert" && a.month === "2026-09")).toBe(true);
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
