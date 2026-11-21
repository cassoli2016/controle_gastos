import { describe, it, expect } from "vitest";
import { observedPerDay, cyclesLabel, withVariableSpend, curveSummary, trendSentence, trendFalls, countsAsVariableSpend } from "@/lib/trend";
import { reserveOutlook } from "@/lib/planning";
import { dailyBudgetEntryView } from "@/lib/entries";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { plannedExpense, type EntryView } from "@/lib/calc";

const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

const conta = (cents: number): EntryView => ({
  itemName: "Conta",
  categoryId: "c",
  categoryName: "Contas",
  categoryType: "EXPENSE",
  plannedCents: cents,
  paid: false,
  paidCents: null,
});
const salario = (cents: number): EntryView => ({ ...conta(cents), itemName: "Salário", categoryType: "INCOME" });

describe("observedPerDay", () => {
  it("divide pelo total de dias dos ciclos, não por 30", () => {
    // ago (31) + set (30) + out (31) = 92 dias. Os valores medidos em 2026.
    const perDay = observedPerDay([
      { monthISO: "2026-08", vistaCents: 909907 },
      { monthISO: "2026-09", vistaCents: 1338936 },
      { monthISO: "2026-10", vistaCents: 732738 },
    ]);
    expect(perDay).toBe(Math.round((909907 + 1338936 + 732738) / 92));
  });
  it("sem ciclo fechado não há tendência", () => expect(observedPerDay([])).toBeNull());
  it("rótulo dos ciclos em ordem", () => {
    expect(cyclesLabel([{ monthISO: "2026-10", vistaCents: 1 }, { monthISO: "2026-08", vistaCents: 1 }, { monthISO: "2026-09", vistaCents: 1 }])).toBe(
      "ago/26, set/26 e out/26",
    );
    expect(cyclesLabel([{ monthISO: "2026-10", vistaCents: 1 }])).toBe("out/26");
  });
});

describe("withVariableSpend", () => {
  const today = "2026-10-20";
  const reservaPlano = (m: string) => dailyBudgetEntryView(dailyBudgetLine(m, today, 15000));
  const byMonth = new Map<string, EntryView[]>([
    ["2026-10", [salario(3000000), conta(1000000), reservaPlano("2026-10")]],
    ["2026-11", [salario(3000000), conta(1000000), reservaPlano("2026-11")]],
    ["2026-12", []],
  ]);
  const out = withVariableSpend(byMonth, "2026-10", today, 33100);

  it("o mês corrente fica como está", () => {
    expect(plannedExpense(out.get("2026-10")!)).toBe(plannedExpense(byMonth.get("2026-10")!));
  });
  it("o mês seguinte troca a reserva pela média observada, dia a dia", () => {
    // novembro tem 30 dias: 30 × 331,00
    expect(plannedExpense(out.get("2026-11")!)).toBe(1000000 + 30 * 33100);
    expect(out.get("2026-11")!.filter((v) => v.categoryId === "daily-budget")).toHaveLength(1);
  });
  it("mês vazio continua vazio", () => expect(out.get("2026-12")).toEqual([]));
  it("a curva muda só por esse número", () => {
    const plano = reserveOutlook(4000000, byMonth);
    const tendencia = reserveOutlook(4000000, out);
    expect(tendencia.curve[0].reservesCents).toBe(plano.curve[0].reservesCents);
    expect(plano.curve[1].reservesCents - tendencia.curve[1].reservesCents).toBe(30 * (33100 - 15000));
  });
});

describe("curveSummary e trendSentence", () => {
  const curva = (vals: number[]) => vals.map((v, i) => ({ month: `2027-${String(i + 1).padStart(2, "0")}`, reservesCents: v }));

  it("resume o horizonte: último ponto e primeiro mês negativo", () => {
    expect(curveSummary(curva([100, 50, -10, 20]), 12)).toEqual({
      atHorizonCents: 20,
      atHorizonMonth: "2027-04",
      firstNegativeMonth: "2027-03",
    });
    expect(curveSummary(curva([100, 50, -10, 20]), 1).firstNegativeMonth).toBeNull();
  });

  it("um ano à frente do mês corrente: nov/26 fala de nov/27, não de out/27", () => {
    const meses = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 10 + i, 1));
      return { month: d.toISOString().slice(0, 7), reservesCents: 100 + i };
    });
    expect(curveSummary(meses, 12).atHorizonMonth).toBe("2027-11");
  });

  it("frases citam o ritmo, a meta e o saldo de hoje", () => {
    const pace = { observedPerDayCents: 34477, planPerDayCents: 15000 };
    expect(norm(trendSentence(curveSummary(curva([100, -5]), 12), 100, pace))).toBe(
      "Se o cartão seguir em R$ 344,77/dia (sua meta é R$ 150,00), as caixinhas acabam em fev/27.",
    );
    expect(norm(trendSentence(curveSummary(curva([100, 5000]), 12), 10000, pace))).toBe(
      "Se o cartão seguir em R$ 344,77/dia (sua meta é R$ 150,00), as reservas caem de R$ 100,00 hoje para R$ 50,00 em fev/27.",
    );
    expect(norm(trendSentence(curveSummary(curva([100, 20000]), 12), 10000, { observedPerDayCents: 34477, planPerDayCents: null }))).toBe(
      "Se o cartão seguir em R$ 344,77/dia, as reservas vão de R$ 100,00 hoje para R$ 200,00 em fev/27.",
    );
    expect(trendSentence(curveSummary([], 12), 0, pace)).toBe("Sem meses à frente para projetar.");
  });

  it("tom: cai quando termina abaixo de hoje ou zera", () => {
    expect(trendFalls(curveSummary(curva([100, 5000]), 12), 10000)).toBe(true);
    expect(trendFalls(curveSummary(curva([100, -5, 20000]), 12), 100)).toBe(true);
    expect(trendFalls(curveSummary(curva([100, 20000]), 12), 10000)).toBe(false);
  });
});

describe("countsAsVariableSpend", () => {
  const base = { cents: 5000, description: "Festval Torres", isInstallment: false, hasPlannedLine: false };
  it("compra à vista conta", () => {
    expect(countsAsVariableSpend(base)).toBe(true);
  });
  it("estorno, parcela e assinatura com linha no Mês não contam", () => {
    expect(countsAsVariableSpend({ ...base, cents: -5000 })).toBe(false);
    expect(countsAsVariableSpend({ ...base, isInstallment: true })).toBe(false);
    expect(countsAsVariableSpend({ ...base, description: "Google Youtubepremium", hasPlannedLine: true })).toBe(false);
  });
  it("parcela cobrada fora do cartão (\"Aut*04de04\") não conta", () => {
    expect(countsAsVariableSpend({ ...base, cents: 32408, description: "Bradesco Aut*04de04" })).toBe(false);
    expect(countsAsVariableSpend({ ...base, description: "Loja*05de04" })).toBe(true);
    expect(countsAsVariableSpend({ ...base, description: "Dafiti*4605843990" })).toBe(true);
  });
});
