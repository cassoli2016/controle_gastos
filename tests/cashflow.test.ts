import { describe, it, expect } from "vitest";
import { cashflowGradient, dailyCashflow, verdictSentence, type CashflowRow } from "@/lib/cashflow";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { dailyBudgetEntryView } from "@/lib/entries";
import { plannedBalance, plannedIncome, plannedExpense, type EntryView } from "@/lib/calc";
import { formatCents } from "@/lib/money";

const base = { paid: false, paidDate: null, dueDay: null, purchaseDate: null };
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
    expect(verdict).toEqual({ alwaysPositive: true, minCents: 0, minDay: 1 });
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
      negativeRanges: [{ from: 3, to: 19 }],
      minCents: -50_00,
      minDay: 3,
    });
  });

  it("pago entra na data real com o valor previsto", () => {
    const { days } = dailyCashflow(
      [expense({ plannedCents: 100_00, dueDay: 20, paid: true, paidDate: new Date("2026-08-02T00:00:00Z") })],
      "2026-08",
      "2026-08-15",
      null,
    );
    // A DATA muda com o pagamento; o VALOR continua sendo o previsto (o mesmo
    // dos stat cards), senão a assinatura consumida pela fatura contaria duas vezes.
    expect(days[1].outCents).toBe(100_00);
    expect(days[19].outCents).toBe(0);
  });

  it("assinatura consumida pela fatura não entra no fluxo", () => {
    // Cobrança real chegou na fatura: consumeSubscriptionCharge zera o previsto
    // e grava paidAmount — o dinheiro agora vive no consolidado do cartão.
    // `paidCents` fica aqui só para provar que o fluxo o ignora.
    const consumida = {
      ...expense({ plannedCents: 0, paid: true, paidDate: new Date("2026-08-07T00:00:00Z"), dueDay: 7 }),
      paidCents: 55_90,
    };
    const { days, verdict } = dailyCashflow([consumida], "2026-08", "2026-08-15", null);
    expect(days.every((d) => d.outCents === 0)).toBe(true);
    expect(days[30].cumulativeCents).toBe(0);
    expect(verdict).toEqual({ alwaysPositive: true, minCents: 0, minDay: 1 });
  });

  it("pago fora do mês de competência encosta na borda", () => {
    const { days } = dailyCashflow(
      [
        expense({ plannedCents: 10_00, paid: true, paidDate: new Date("2026-07-28T00:00:00Z"), dueDay: 10 }),
        income({ plannedCents: 20_00, paid: true, paidDate: new Date("2026-09-02T00:00:00Z"), dueDay: 15 }),
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

  it("reserva no fluxo soma exatamente a linha derivada da lista", () => {
    const perDayCents = 100_00;
    for (const [month, hoje] of [
      ["2026-07", "2026-08-15"], // passado
      ["2026-08", "2026-08-15"], // corrente
      ["2026-08", "2026-08-01"], // corrente, primeiro dia (mês cheio)
      ["2026-08", "2026-08-31"], // corrente, último dia
      ["2026-09", "2026-08-15"], // futuro
    ] as const) {
      const { days } = dailyCashflow([], month, hoje, { perDayCents });
      const noFluxo = days.reduce((acc, d) => acc + d.outCents, 0);
      expect([month, hoje, noFluxo]).toEqual([month, hoje, dailyBudgetLine(month, hoje, perDayCents).cents]);
    }
  });

  it("mês corrente combina pago, em aberto e reserva", () => {
    const { days } = dailyCashflow(
      [
        income({ plannedCents: 500_00, dueDay: 5, paid: true, paidDate: new Date("2026-08-03T00:00:00Z") }),
        expense({ plannedCents: 200_00, dueDay: 10 }),
      ],
      "2026-08",
      "2026-08-04",
      { perDayCents: 10_00 },
    );
    // Dia 3: só a receita paga (a reserva começa hoje, dia 4).
    expect(days[2].cumulativeCents).toBe(500_00);
    expect(days[3].outCents).toBe(10_00);
    // Dia 10: receita − despesa − 7 dias de reserva (dias 4..10).
    expect(days[9].cumulativeCents).toBe(500_00 - 200_00 - 7 * 10_00);
    // Último dia: 28 dias de reserva (4..31).
    expect(days[30].cumulativeCents).toBe(500_00 - 200_00 - 28 * 10_00);
  });

  it("reconcilia com os stat cards: último dia = receitas − despesas − reserva", () => {
    const rows: CashflowRow[] = [
      income({ plannedCents: 800_00, dueDay: 5, paid: true, paidDate: new Date("2026-08-05T00:00:00Z") }),
      income({ plannedCents: 120_00 }), // sem data
      expense({ plannedCents: 250_00, dueDay: 12 }),
      expense({ plannedCents: 90_00, paid: true, paidDate: new Date("2026-08-02T00:00:00Z"), dueDay: 20 }),
      expense({ plannedCents: 0, paid: true, paidDate: new Date("2026-08-09T00:00:00Z"), dueDay: 9 }), // assinatura consumida
      expense({ plannedCents: 40_00, purchaseDate: new Date("2026-08-22T00:00:00Z") }),
    ];
    const perDayCents = 100_00;
    const { days } = dailyCashflow(rows, "2026-08", "2026-08-04", { perDayCents });
    const receitas = rows.filter((r) => r.categoryType === "INCOME").reduce((a, r) => a + r.plannedCents, 0);
    const despesas = rows.filter((r) => r.categoryType === "EXPENSE").reduce((a, r) => a + r.plannedCents, 0);
    const reserva = dailyBudgetLine("2026-08", "2026-08-04", perDayCents).cents;
    expect(days[days.length - 1].cumulativeCents).toBe(receitas - despesas - reserva);
  });

  it("mês que alterna negativo → positivo → negativo devolve dois trechos", () => {
    const { verdict } = dailyCashflow(
      [
        expense({ plannedCents: 100_00, dueDay: 1 }),
        income({ plannedCents: 300_00, dueDay: 5 }),
        expense({ plannedCents: 500_00, dueDay: 20 }),
      ],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdict).toEqual({
      alwaysPositive: false,
      negativeRanges: [
        { from: 1, to: 4 },
        { from: 20, to: 31 },
      ],
      minCents: -300_00,
      minDay: 20,
    });
  });
});

describe("reconciliação com app/(app)/mes/page.tsx", () => {
  // Estas linhas precisam satisfazer os DOIS tipos: `CashflowRow` (o que
  // `dailyCashflow` consome) e `EntryView` (o que `plannedIncome`/
  // `plannedExpense`/`plannedBalance` de lib/calc consomem) — é o mesmo objeto
  // que `realViews` é em app/(app)/mes/page.tsx.
  type Row = CashflowRow & EntryView;
  const rowBase = {
    itemName: "Linha",
    categoryId: "cat",
    categoryName: "Categoria",
    paid: false,
    paidCents: null,
    paidDate: null,
    dueDay: null,
    purchaseDate: null,
  };
  const rowIncome = (over: Partial<Row>): Row => ({ ...rowBase, categoryType: "INCOME", plannedCents: 0, ...over });
  const rowExpense = (over: Partial<Row>): Row => ({ ...rowBase, categoryType: "EXPENSE", plannedCents: 0, ...over });

  /** "2026-08" → "2026-07": mês anterior, para a linha paga fora da competência. */
  function prevMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  /** Conjunto variado: receita/despesa × paga/aberta, sem data, e paga fora do mês de competência. */
  function buildRows(month: string): Row[] {
    return [
      rowIncome({ plannedCents: 800_00, dueDay: 5, paid: true, paidCents: 800_00, paidDate: new Date(`${month}-05T00:00:00Z`) }),
      rowIncome({ plannedCents: 120_00, dueDay: 20 }), // receita em aberto
      rowIncome({ plannedCents: 60_00 }), // receita sem data
      rowExpense({ plannedCents: 250_00, dueDay: 12 }), // despesa em aberto
      rowExpense({ plannedCents: 90_00, paid: true, paidCents: 90_00, dueDay: 20, paidDate: new Date(`${month}-02T00:00:00Z`) }),
      rowExpense({ plannedCents: 40_00, purchaseDate: new Date(`${month}-22T00:00:00Z`) }), // avulso em aberto
      rowExpense({ plannedCents: 30_00 }), // despesa sem data
      rowExpense({
        plannedCents: 15_00,
        paid: true,
        paidCents: 15_00,
        dueDay: 10,
        paidDate: new Date(`${prevMonth(month)}-28T00:00:00Z`), // paga fora do mês de competência
      }),
    ];
  }

  const cenarios: Array<[string, string, string]> = [
    ["mês passado", "2026-06", "2026-08-15"],
    ["mês corrente", "2026-08", "2026-08-15"],
    ["mês futuro", "2026-10", "2026-08-15"],
  ];

  for (const [rotulo, month, todayISO] of cenarios) {
    it(`bate com plannedIncome/plannedExpense/plannedBalance (${rotulo})`, () => {
      const perDayCents = 100_00;
      // Montagem IDÊNTICA à da página: `views` inclui a linha derivada da
      // reserva, `dailyCashflow` recebe só `realViews` (a reserva entra pelo
      // parâmetro `budget` à parte).
      const realViews = buildRows(month);
      const budgetLine = dailyBudgetLine(month, todayISO, perDayCents);
      const views: EntryView[] = [...realViews, dailyBudgetEntryView(budgetLine)];

      const { days } = dailyCashflow(realViews, month, todayISO, { perDayCents });
      const totalIn = days.reduce((acc, d) => acc + d.inCents, 0);
      const totalOut = days.reduce((acc, d) => acc + d.outCents, 0);

      expect(totalIn).toBe(plannedIncome(views));
      expect(totalOut).toBe(plannedExpense(views));
      expect(days[days.length - 1].cumulativeCents).toBe(plannedBalance(views));
    });
  }
});

describe("verdictSentence", () => {
  it("descreve o mês positivo com o menor saldo", () => {
    const { verdict } = dailyCashflow([income({ plannedCents: 100_00, dueDay: 5 })], "2026-08", "2026-08-01", null);
    expect(verdictSentence(verdict)).toBe(`Positivo o mês todo; menor saldo: ${formatCents(0)} no dia 1.`);
  });

  it("descreve um trecho negativo de vários dias", () => {
    const { verdict } = dailyCashflow(
      [expense({ plannedCents: 50_00, dueDay: 3 }), income({ plannedCents: 100_00, dueDay: 20 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdictSentence(verdict)).toBe(`Fica negativo do dia 3 ao dia 19; pior momento: ${formatCents(-50_00)} no dia 3.`);
  });

  it("descreve um único dia negativo", () => {
    const { verdict } = dailyCashflow(
      [expense({ plannedCents: 50_00, dueDay: 3 }), income({ plannedCents: 100_00, dueDay: 4 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdictSentence(verdict)).toBe(`Fica negativo no dia 3; pior momento: ${formatCents(-50_00)} no dia 3.`);
  });

  it("descreve trechos alternados sem inventar intervalo contínuo", () => {
    const { verdict } = dailyCashflow(
      [
        expense({ plannedCents: 100_00, dueDay: 1 }),
        income({ plannedCents: 300_00, dueDay: 5 }),
        expense({ plannedCents: 500_00, dueDay: 20 }),
      ],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdictSentence(verdict)).toBe(
      `Fica negativo em 2 trechos: dias 1 a 4 e 20 a 31; pior momento: ${formatCents(-300_00)} no dia 20.`,
    );
  });
});

describe("cashflowGradient", () => {
  it("marca a curva plana (o gradiente não renderiza com altura zero)", () => {
    expect(cashflowGradient([500, 500, 500]).flat).toBe(true);
    expect(cashflowGradient([0, 0, 0]).flat).toBe(true);
    expect(cashflowGradient([-100, 500]).flat).toBe(false);
  });

  it("põe o zero na proporção da amplitude", () => {
    expect(cashflowGradient([-100, 300]).zeroOffset).toBeCloseTo(0.75);
    expect(cashflowGradient([100, 300]).zeroOffset).toBe(1); // tudo positivo: sem faixa vermelha
  });
});
