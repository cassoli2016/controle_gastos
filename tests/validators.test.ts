import { describe, it, expect } from "vitest";
import {
  categorySchema,
  itemSchema,
  entryUpsertSchema,
  markPaidSchema,
  applyRangeSchema,
  cardSchema,
  purchaseSchema,
  dailyBudgetSchema,
  incomeSchema,
} from "@/lib/validators";

describe("validators", () => {
  it("categorySchema aceita válido", () => {
    expect(categorySchema.safeParse({ name: "Saúde", type: "EXPENSE", color: "#22c55e" }).success).toBe(true);
  });
  it("categorySchema rejeita cor inválida e nome vazio", () => {
    expect(categorySchema.safeParse({ name: "", type: "EXPENSE", color: "verde" }).success).toBe(false);
  });
  it("itemSchema aceita dueDay 1..31 e nulo", () => {
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: 3, active: true }).success).toBe(true);
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: null }).success).toBe(true);
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: 40 }).success).toBe(false);
  });
  it("entryUpsertSchema valida competência YYYY-MM", () => {
    expect(entryUpsertSchema.safeParse({ itemId: "i1", month: "2026-08", plannedAmount: 220 }).success).toBe(true);
    expect(entryUpsertSchema.safeParse({ itemId: "i1", month: "2026/08", plannedAmount: 220 }).success).toBe(false);
  });
  it("markPaidSchema", () => {
    expect(markPaidSchema.safeParse({ entryId: "e1", paid: true, paidAmount: 220, paidDate: "2026-08-05" }).success).toBe(true);
  });
  it("applyRangeSchema aceita intervalo válido e rejeita 'até' antes de 'de'", () => {
    expect(
      applyRangeSchema.safeParse({ itemId: "i1", from: "2026-01", to: "2026-06", amount: 220 }).success,
    ).toBe(true);
    expect(
      applyRangeSchema.safeParse({ itemId: "i1", from: "2026-06", to: "2026-01", amount: 220 }).success,
    ).toBe(false);
  });

  it("cardSchema aceita válido e rejeita cor/nome inválidos", () => {
    expect(cardSchema.safeParse({ name: "Nubank", color: "#8a05be" }).success).toBe(true);
    expect(cardSchema.safeParse({ name: "", color: "#8a05be" }).success).toBe(false);
    expect(cardSchema.safeParse({ name: "Nubank", color: "roxo" }).success).toBe(false);
  });

  it("purchaseSchema aceita compra válida", () => {
    const parsed = purchaseSchema.safeParse({
      cardId: "c1",
      description: "Notebook",
      categoryId: "cat1",
      amount: 3500,
      installments: 10,
      date: "2026-08-15",
      recurring: null, // checkbox desmarcado: ausente do FormData
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurring).toBe(false);
  });
  it("purchaseSchema: checkbox 'on' vira recurring true", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Academia",
      amount: 99.9,
      installments: 1,
      date: "2026-08-01",
      recurring: "on",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurring).toBe(true);
  });
  it("purchaseSchema rejeita amount 0", () => {
    expect(
      purchaseSchema.safeParse({
        description: "Notebook",
        amount: 0,
        installments: 1,
        startMonth: "2026-08",
      }).success,
    ).toBe(false);
  });
  it("purchaseSchema rejeita installments 0 e 121", () => {
    expect(
      purchaseSchema.safeParse({
        description: "Notebook",
        amount: 100,
        installments: 0,
        startMonth: "2026-08",
      }).success,
    ).toBe(false);
    expect(
      purchaseSchema.safeParse({
        description: "Notebook",
        amount: 100,
        installments: 121,
        startMonth: "2026-08",
      }).success,
    ).toBe(false);
  });
  it("purchaseSchema rejeita description vazia", () => {
    expect(
      purchaseSchema.safeParse({
        description: "",
        amount: 100,
        installments: 1,
        startMonth: "2026-08",
      }).success,
    ).toBe(false);
  });

  it("purchaseSchema usa 12 meses quando a duração não vem no FormData", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Diarista",
      amount: 220,
      date: "2026-08-04",
      recurring: "on",
      intervalMonths: "0",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(12);
  });

  it("purchaseSchema aceita duração de 24 meses", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Diarista",
      amount: 220,
      date: "2026-08-04",
      recurring: "on",
      intervalMonths: "0",
      recurrenceMonths: "24",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(24);
  });

  it("purchaseSchema rejeita duração fora de 2..60", () => {
    const campos = { description: "X", amount: 10, date: "2026-08-04", recurring: "on", intervalMonths: "1" };
    expect(purchaseSchema.safeParse({ ...campos, recurrenceMonths: "1" }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...campos, recurrenceMonths: "61" }).success).toBe(false);
  });
});

describe("purchaseSchema com recorrência", () => {
  it("parcelas ausentes (input desabilitado) viram 1", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Academia",
      amount: 99.9,
      installments: null,
      date: "2026-08-01",
      recurring: "on",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.installments).toBe(1);
  });
});

describe("dailyBudgetSchema", () => {
  it("aceita valor positivo", () => {
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "100" }).success).toBe(true);
    expect(dailyBudgetSchema.safeParse({ amountPerDay: 50.5 }).success).toBe(true);
  });
  it("rejeita zero e negativo", () => {
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "0" }).success).toBe(false);
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "-10" }).success).toBe(false);
  });

  it("incomeSchema usa 12 meses quando a duração não vem no FormData", () => {
    const parsed = incomeSchema.safeParse({
      description: "Salário",
      amount: 25000,
      date: "2026-08-05",
      recurring: "on",
      fifthBusinessDay: null,
      intervalMonths: "1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(12);
  });

  it("incomeSchema aceita duração de 24 meses", () => {
    const parsed = incomeSchema.safeParse({
      description: "Salário",
      amount: 25000,
      date: "2026-08-05",
      recurring: "on",
      fifthBusinessDay: null,
      intervalMonths: "1",
      recurrenceMonths: "24",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(24);
  });

  it("incomeSchema rejeita duração fora de 2..60", () => {
    const campos = {
      description: "Salário",
      amount: 25000,
      date: "2026-08-05",
      recurring: "on",
      fifthBusinessDay: null,
      intervalMonths: "1",
    };
    expect(incomeSchema.safeParse({ ...campos, recurrenceMonths: "1" }).success).toBe(false);
    expect(incomeSchema.safeParse({ ...campos, recurrenceMonths: "61" }).success).toBe(false);
  });
});
