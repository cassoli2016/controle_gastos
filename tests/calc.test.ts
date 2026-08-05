import { describe, it, expect } from "vitest";
import {
  plannedIncome, plannedExpense, plannedBalance, remainingToPay,
  paidExpense, receivedIncome, progressPct, isOverdue,
  expenseRanking, expenseByCategory, realizedBalance, type EntryView,
} from "@/lib/calc";
import { dailyBudgetEntryView } from "@/lib/entries";
import { dailyBudgetLine } from "@/lib/daily-budget";

const E: EntryView[] = [
  { itemName: "SALÁRIO", categoryId: "cat-renda", categoryName: "Renda", categoryType: "INCOME", plannedCents: 2500000, paid: true, paidCents: 2500000 },
  { itemName: "YOUTUBE", categoryId: "cat-assin", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 6000, paid: true, paidCents: 6000 },
  { itemName: "ESTACIONAMENTO", categoryId: "cat-transp", categoryName: "Transporte", categoryType: "EXPENSE", plannedCents: 22000, paid: false, paidCents: null },
  { itemName: "PS PLUS", categoryId: "cat-assin", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 59000, paid: false, paidCents: null },
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
  it("expenseByCategory agrega por ID, rotula pelo nome e ordena desc", () => {
    expect(expenseByCategory(E)).toEqual([
      { categoryId: "cat-assin", categoryName: "Assinaturas", cents: 65000 },
      { categoryId: "cat-transp", categoryName: "Transporte", cents: 22000 },
    ]);
  });
  it("categorias homônimas com ids diferentes NÃO se misturam", () => {
    const homon: EntryView[] = [
      { itemName: "A", categoryId: "c1", categoryName: "Outros", categoryType: "EXPENSE", plannedCents: 100, paid: false, paidCents: null },
      { itemName: "B", categoryId: "c2", categoryName: "Outros", categoryType: "EXPENSE", plannedCents: 200, paid: false, paidCents: null },
    ];
    expect(expenseByCategory(homon)).toHaveLength(2);
  });
});

describe("reserva do dia a dia nos cálculos do mês", () => {
  // 6 dias restantes × R$ 100 = R$ 600,00
  const reserva = dailyBudgetEntryView(dailyBudgetLine("2026-07", "2026-07-26", 10000));
  const comReserva: EntryView[] = [...E, reserva];

  it("linha da reserva carrega o id sintético", () =>
    expect(reserva.categoryId).toBe("daily-budget"));
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
      categoryId: "daily-budget",
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

describe("realizedBalance — a sobra de fato do mês", () => {
  const v = (
    categoryType: "INCOME" | "EXPENSE",
    plannedCents: number,
    paid: boolean,
    paidCents: number | null = null,
  ) => ({ itemName: "x", categoryId: "c", categoryName: "C", categoryType, plannedCents, paid, paidCents });

  it("soma o que entrou menos o que saiu", () => {
    const e = [v("INCOME", 2500000, true, 2500000), v("EXPENSE", 1800000, true, 1800000)];
    expect(realizedBalance(e)).toBe(700000);
  });

  it("ignora o que ainda não foi pago nem recebido", () => {
    // A conta em aberto não desconta: o dinheiro ainda está na conta.
    const e = [
      v("INCOME", 2500000, true, 2500000),
      v("EXPENSE", 1800000, true, 1800000),
      v("EXPENSE", 200000, false),
    ];
    expect(realizedBalance(e)).toBe(700000);
  });

  it("salário que não caiu não entra na sobra", () => {
    // É a diferença central em relação ao plannedBalance, que diria 700.000.
    const e = [v("INCOME", 2500000, false), v("EXPENSE", 1800000, true, 1800000)];
    expect(realizedBalance(e)).toBe(-1800000);
    expect(plannedBalance(e)).toBe(700000);
  });

  it("usa o valor pago, não o previsto, quando eles diferem", () => {
    const e = [v("INCOME", 2500000, true, 2600000), v("EXPENSE", 1800000, true, 1750000)];
    expect(realizedBalance(e)).toBe(850000);
  });

  it("cai no previsto quando a baixa não guardou valor", () => {
    const e = [v("INCOME", 1000000, true, null), v("EXPENSE", 400000, true, null)];
    expect(realizedBalance(e)).toBe(600000);
  });

  it("mês vazio é zero", () => {
    expect(realizedBalance([])).toBe(0);
  });
});
