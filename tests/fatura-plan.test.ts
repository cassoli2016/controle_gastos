import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faturaPlanStates, expectedTail, reconcileTail, allPlans, type TailAction } from "@/lib/fatura-plan";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import type { FaturaLine } from "@/lib/fatura-core";
import { findOrphans, type AppRow } from "@/lib/fatura-match";

function inv(description: string, cents: number, seq: number, count: number): FaturaLine {
  return { dateISO: "2026-07-05", description, cents, kind: "purchase", installment: { seq, count } };
}

describe("faturaPlanStates", () => {
  it("chargedThrough é a maior parcela cobrada", () => {
    const states = faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []);
    const s = allPlans(states)[0];
    expect(s.chargedThrough).toBe(3);
    expect(s.count).toBe(6);
    expect(s.cents).toBe(92820);
  });

  it("quitação antecipada: chargedThrough vai até o fim", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const s = allPlans(faturaPlanStates(lines, []))[0];
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
    const s = allPlans(faturaPlanStates([], [orphan]))[0];
    expect(s.chargedThrough).toBe(2);
    expect(s.count).toBe(6);
  });

  it("órfã à vista não cria plano", () => {
    const orphan: AppRow = { id: "x", description: "Es Estacionamento", cents: 23000, installment: null };
    expect(allPlans(faturaPlanStates([], [orphan])).length).toBe(0);
  });

  it("a fatura ganha da órfã quando as duas conhecem o plano", () => {
    const line = inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6);
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const s = allPlans(faturaPlanStates([line], [orphan]))[0];
    expect(s.chargedThrough).toBe(3);
  });

  it("separa planos da mesma loja por valor da parcela", () => {
    const states = faturaPlanStates(
      [inv("Franciscana - Parcela 8/12", 1799, 8, 12), inv("Franciscana - Parcela 9/9", 3088, 9, 9)],
      [],
    );
    expect(allPlans(states).length).toBe(2);
  });
});

describe("expectedTail", () => {
  it("projeta chargedThrough+1..count nos meses seguintes", () => {
    const [state] = allPlans(faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []));
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 4 },
      { month: "2026-10", seq: 5 },
      { month: "2026-11", seq: 6 },
    ]);
  });

  it("plano quitado tem cauda vazia", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const [state] = allPlans(faturaPlanStates(lines, []));
    expect(expectedTail(state, "2026-08")).toEqual([]);
  });

  it("parcela atrasada desloca: a cauda recomeça na parcela não cobrada", () => {
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const [state] = allPlans(faturaPlanStates([], [orphan]));
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 3 },
      { month: "2026-10", seq: 4 },
      { month: "2026-11", seq: 5 },
      { month: "2026-12", seq: 6 },
    ]);
  });

  it("vira o ano", () => {
    const [state] = allPlans(faturaPlanStates([inv("Loja - Parcela 1/3", 1000, 1, 3)], []));
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
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: new Map(), bank: "nubank" });
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
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing, bank: "nubank" });
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
      existingByMonth: existing, bank: "nubank"
    });
    expect(actions).toEqual([{ kind: "delete", id: "velha" }]);
  });

  it("move a parcela para o mês certo quando o plano desloca", () => {
    const orphan = row("x", "Mabu Hotel - Parcela 3/6", 92820, 3, 6);
    const existing = new Map([["2026-09", [row("a", "Mabu Hotel - Parcela 4/6", 92820, 4, 6)]]]);
    const actions = reconcileTail({
      states: faturaPlanStates([], [orphan]),
      faturaMonth: "2026-08",
      existingByMonth: existing, bank: "nubank"
    });
    // Setembro tinha a 4 e agora tem que ter a 3: apaga a 4, insere a 3.
    expect(actions).toContainEqual({ kind: "delete", id: "a" });
    const ins = actions.filter((a) => a.kind === "insert") as Extract<TailAction, { kind: "insert" }>[];
    expect(ins.map((i) => `${i.month}:${i.seq}`)).toEqual(["2026-09:3", "2026-10:4", "2026-11:5", "2026-12:6"]);
  });

  it("PRESERVA compra à vista em mês futuro", () => {
    // Regressão dos R$ 941,04: as compras do ciclo novo não podem sair.
    const existing = new Map([["2026-09", [row("vista", "Es Estacionamento", 23000)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing, bank: "nubank" });
    expect(actions.some((a) => a.kind === "delete")).toBe(false);
  });

  it("PRESERVA plano que a fatura não conhece", () => {
    // Compra parcelada feita DEPOIS do fechamento: a fatura fechada não a lista.
    const existing = new Map([["2026-09", [row("nova", "Loja Nova - Parcela 1/5", 5000, 1, 5)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing, bank: "nubank" });
    expect(actions.some((a) => a.kind === "delete" && a.id === "nova")).toBe(false);
  });

  it("não mexe no mês da fatura (é o replace que manda lá)", () => {
    const existing = new Map([["2026-08", [row("a", "Mabu Hotel - Parcela 3/6", 92820, 3, 6)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing, bank: "nubank" });
    expect(actions.some((a) => a.kind === "delete" && a.id === "a")).toBe(false);
  });

  it("corrige valor divergente da parcela", () => {
    const existing = new Map([["2026-09", [row("a", "Mabu Hotel - Parcela 4/6", 92800, 4, 6)]]]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing, bank: "nubank" });
    // Valor diferente ⇒ chave de plano diferente ⇒ a linha antiga não pertence
    // ao plano da fatura e sobrevive; a correta é inserida.
    expect(actions.some((a) => a.kind === "insert" && a.month === "2026-09")).toBe(true);
  });
});

describe("planos gêmeos — dois carros, o mesmo serviço, o mesmo dia", () => {
  // A fatura de nov/2026 trouxe "Byd Sao Jose - Parcela 1/6" duas vezes com
  // R$ 130,60 e duas vezes com R$ 166,70. Não é duplicata: são dois veículos.
  // Antes, as duas linhas iguais viravam UM plano e a cauda do segundo carro
  // nunca era gerada — R$ 297,30 a menos em cada um dos cinco meses seguintes.
  const twins = [inv("Byd Sao Jose - Parcela 1/6", 13060, 1, 6), inv("Byd Sao Jose - Parcela 1/6", 13060, 1, 6)];

  it("duas linhas iguais com a MESMA parcela são dois planos", () => {
    const plans = allPlans(faturaPlanStates(twins, []));
    expect(plans).toHaveLength(2);
    expect(new Set(plans.map((p) => p.key)).size).toBe(2);
    expect(plans.map((p) => p.chargedThrough)).toEqual([1, 1]);
  });

  it("quitação antecipada continua sendo UM plano (parcelas diferentes)", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10), inv("Antecipada - Nescafe - Parcela 3/10", 3380, 3, 10)];
    expect(allPlans(faturaPlanStates(lines, []))).toHaveLength(1);
  });

  it("a cauda sai em dobro: duas parcelas por mês", () => {
    const actions = reconcileTail({ states: faturaPlanStates(twins, []), faturaMonth: "2026-11", existingByMonth: new Map(), bank: "nubank" });
    const inserts = actions.flatMap((a) => (a.kind === "insert" ? [a] : []));
    expect(inserts).toHaveLength(10); // 2 planos × parcelas 2..6
    expect(inserts.filter((a) => a.month === "2026-12").map((a) => a.seq)).toEqual([2, 2]);
  });

  it("as duas linhas já lançadas cobrem os dois planos — nada a inserir nem apagar", () => {
    // O bot gravou cada carro com o arredondamento próprio (130,58 e 130,60).
    const existing = new Map([
      ["2026-12", [row("a", "Byd Sao Jose", 13058, 2, 6), row("b", "Byd Sao Jose", 13060, 2, 6)]],
    ]);
    const actions = reconcileTail({ states: faturaPlanStates(twins, []), faturaMonth: "2026-11", existingByMonth: existing, bank: "nubank" });
    expect(actions.filter((a) => a.kind === "delete" || (a.kind === "insert" && a.month === "2026-12"))).toEqual([]);
  });

  it("uma terceira linha igual no mês não tem plano que a queira: sai", () => {
    const existing = new Map([
      ["2026-12", [row("a", "Byd Sao Jose", 13060, 2, 6), row("b", "Byd Sao Jose", 13060, 2, 6), row("c", "Byd Sao Jose", 13060, 2, 6)]],
    ]);
    const actions = reconcileTail({ states: faturaPlanStates(twins, []), faturaMonth: "2026-11", existingByMonth: existing, bank: "nubank" });
    expect(actions.filter((a) => a.kind === "delete")).toEqual([{ kind: "delete", id: "c" }]);
  });
});

describe("faturaPlanStates — fatura real", () => {
  const text = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");
  const f = parseNubankFatura(text);
  if ("error" in f) throw new Error(f.error);

  it("77 planos distintos", () => {
    expect(allPlans(faturaPlanStates(f.lines, [])).length).toBe(77);
  });

  it("a cauda total bate com a projeção validada", () => {
    const states = faturaPlanStates(f.lines, []);
    const total = allPlans(states).reduce((a, s) => a + expectedTail(s, f.faturaMonth).length * s.cents, 0);
    expect(total).toBe(2002897);
  });
});

describe("compra do ciclo novo já lançada pelo caminho curto (fatura Bradesco de 27/08/2026)", () => {
  // Regressão do que dobrou R$ 3.372,61 de out/2026 a jul/2027: as compras
  // feitas depois do fechamento já estavam no app com o nome curto do aviso do
  // banco e a parcela por divisão do total (435,90 ÷ 10 = 43,59); a fatura
  // trouxe o nome do seller com cidade e o valor real (43,61). Nenhuma casava,
  // cada uma virava "parcela atrasada", e a cauda 01..N nascia ao lado da 02..N.
  const lines: FaturaLine[] = [
    inv("AMAZONMKTPLC*RETLAWCOM SAO PAULO(01/10)", 4361, 1, 10),
    inv("AMAZON BR SAO PAULO(01/02)", 1330, 1, 2),
  ];
  const appRows: AppRow[] = [
    { id: "a1", description: "AMAZONMKTPLC*RETLAWCOM", cents: 4359, installment: { seq: 1, count: 10 } },
    { id: "a2", description: "AMAZON BR", cents: 1330, installment: { seq: 1, count: 2 } },
  ];

  function tailFor(rows: AppRow[]): TailAction[] {
    const orphans = findOrphans(rows, lines);
    return reconcileTail({
      states: faturaPlanStates(lines, orphans),
      faturaMonth: "2026-09",
      existingByMonth: new Map(),
      bank: "bradesco",
    });
  }

  it("a compra já lançada não é órfã", () => {
    expect(findOrphans(appRows, lines)).toEqual([]);
  });

  it("nenhuma parcela 1 é inserida nos meses futuros", () => {
    const inserts = tailFor(appRows).filter((a) => a.kind === "insert");
    expect(inserts.filter((a) => a.kind === "insert" && a.seq === 1)).toEqual([]);
  });

  it("a cauda começa na parcela 2, no mês seguinte, com o nome da fatura", () => {
    const inserts = tailFor(appRows).flatMap((a) => (a.kind === "insert" ? [a] : []));
    // 10x: parcelas 2..10 em out/2026..jun/2027. 2x: parcela 2 em out/2026.
    expect(inserts).toHaveLength(10);
    const first = inserts.find((a) => a.description.startsWith("AMAZONMKTPLC*RETLAWCOM"));
    expect(first).toMatchObject({
      month: "2026-10",
      seq: 2,
      count: 10,
      cents: 4361,
      description: "AMAZONMKTPLC*RETLAWCOM SAO PAULO(02/10)",
    });
    const last = inserts.filter((a) => a.count === 10).at(-1);
    expect(last).toMatchObject({ month: "2027-06", seq: 10 });
  });
});

describe("nome curto do aviso × nome com cidade da fatura (fatura Bradesco de 27/10/2026)", () => {
  // Regressão de R$ 1.142,34 em dez/2026..ago/2027: o aviso do banco lançou a
  // compra de outubro com o nome curto e a cauda inteira; a fatura trouxe o nome
  // com cidade. O mês da fatura casava (3º passe de findOrphans), mas os meses
  // futuros caíam em outro balde, a cauda do aviso era preservada como "plano
  // que a fatura não conhece" e a da fatura nascia ao lado.
  const lines: FaturaLine[] = [
    inv("AMAZON BR SAO PAULO(01/07)", 2058, 1, 7),
    inv("AMAZON BR SAO PAULO(01/07)", 2075, 1, 7),
    inv("AMAZONMKTPLC*JAVIANACO SAO PAULO(02/10)", 4398, 2, 10),
  ];

  it("a cauda do aviso cobre o plano da fatura: nada a inserir nem apagar", () => {
    const existingByMonth = new Map<string, AppRow[]>();
    for (let seq = 2; seq <= 7; seq++) {
      const month = shiftMonth("2026-11", seq - 1);
      existingByMonth.set(month, [
        { id: `aviso-${seq}`, description: "AMAZON BR", cents: 2053, installment: { seq, count: 7 } },
        { id: `fat-${seq}`, description: `AMAZON BR SAO PAULO(0${seq}/07)`, cents: 2075, installment: { seq, count: 7 } },
      ]);
    }
    const actions = reconcileTail({
      states: faturaPlanStates(lines.slice(0, 2), []),
      faturaMonth: "2026-11",
      existingByMonth,
      bank: "bradesco",
    });
    expect(actions).toEqual([]);
  });

  it("com as duas caudas no mês, fica a da fatura e sai a do aviso", () => {
    const existingByMonth = new Map<string, AppRow[]>([
      [
        "2026-12",
        [
          { id: "aviso", description: "AMAZON BR", cents: 2053, installment: { seq: 2, count: 7 } },
          { id: "fat-a", description: "AMAZON BR SAO PAULO(02/07)", cents: 2058, installment: { seq: 2, count: 7 } },
          { id: "fat-b", description: "AMAZON BR SAO PAULO(02/07)", cents: 2075, installment: { seq: 2, count: 7 } },
        ],
      ],
    ]);
    const actions = reconcileTail({
      states: faturaPlanStates(lines.slice(0, 2), []),
      faturaMonth: "2026-11",
      existingByMonth,
      bank: "bradesco",
    });
    expect(actions.filter((a) => a.kind === "delete")).toEqual([{ kind: "delete", id: "aviso" }]);
    expect(actions.filter((a) => a.kind === "insert" && a.month === "2026-12")).toEqual([]);
  });

  it("parcela do aviso com a numeração de outra parcela não é absorvida", () => {
    // Compra NOVA com nome curto: 1/7 no mês seguinte, quando o plano da fatura
    // está na 2/7. A numeração diferente separa as duas.
    const existingByMonth = new Map<string, AppRow[]>([
      ["2026-12", [{ id: "nova", description: "AMAZON BR", cents: 2060, installment: { seq: 1, count: 7 } }]],
    ]);
    const actions = reconcileTail({
      states: faturaPlanStates(lines.slice(0, 2), []),
      faturaMonth: "2026-11",
      existingByMonth,
      bank: "bradesco",
    });
    expect(actions.some((a) => a.kind === "delete")).toBe(false);
  });

  it("linha repetida sem cidade no mês da fatura não desloca o plano", () => {
    const orphan: AppRow = {
      id: "dup",
      description: "AMAZONMKTPLC*JAVIANACO(02/10)",
      cents: 4398,
      installment: { seq: 2, count: 10 },
    };
    const plans = allPlans(faturaPlanStates(lines, [orphan]));
    const java = plans.filter((p) => p.count === 10);
    expect(java).toHaveLength(1);
    expect(java[0].chargedThrough).toBe(2);
  });
});

function shiftMonth(month: string, delta: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
