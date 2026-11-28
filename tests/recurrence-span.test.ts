import { describe, it, expect } from "vitest";
import { monthSpan, occurrencesUntil, lastOccurrence, isPastEnd, normalizeMonthInput } from "@/lib/recurrence-span";
import { purchaseSchema } from "@/lib/validators";

describe("prazo final da recorrência", () => {
  it("bimestral de 11/2026 até 12/2029: 19 ocorrências, a última em 11/2029", () => {
    expect(monthSpan("2026-11", "2029-12")).toBe(38);
    expect(occurrencesUntil("2026-11", "2029-12", 2)).toBe(19);
    expect(lastOccurrence("2026-11", "2029-12", 2)).toBe("2029-11");
  });

  it("mensal inclui o mês final; trimestral respeita a cadência", () => {
    expect(occurrencesUntil("2026-11", "2027-10", 1)).toBe(12);
    expect(lastOccurrence("2026-11", "2027-10", 1)).toBe("2027-10");
    expect(occurrencesUntil("2026-11", "2027-11", 3)).toBe(5);
    expect(lastOccurrence("2026-11", "2027-11", 3)).toBe("2027-11");
  });

  it("mês final igual ao inicial = 1 ocorrência; anterior = nenhuma", () => {
    expect(occurrencesUntil("2026-11", "2026-11", 2)).toBe(1);
    expect(occurrencesUntil("2026-11", "2026-10", 1)).toBe(0);
    expect(lastOccurrence("2026-11", "2026-10", 1)).toBeNull();
  });

  it("isPastEnd: o mês final ainda vale; o seguinte não", () => {
    const end = new Date(Date.UTC(2029, 11, 1));
    expect(isPastEnd(end, new Date(Date.UTC(2029, 11, 1)))).toBe(false);
    expect(isPastEnd(end, new Date(Date.UTC(2030, 0, 1)))).toBe(true);
    expect(isPastEnd(null, new Date(Date.UTC(2099, 0, 1)))).toBe(false);
  });

  it("normalizeMonthInput aceita 12/2029 e 2029-12", () => {
    expect(normalizeMonthInput("12/2029")).toBe("2029-12");
    expect(normalizeMonthInput("3/2028")).toBe("2028-03");
    expect(normalizeMonthInput("2029-12")).toBe("2029-12");
    expect(normalizeMonthInput("13/2029")).toBe("13/2029");
  });
});

describe("purchaseSchema.recurrenceEnd", () => {
  const base = { description: "Dedetização", amount: 180, installments: 1, date: "2026-11-28", recurring: "on", intervalMonths: "2" };

  it("aceita MM/AAAA e normaliza", () => {
    const p = purchaseSchema.safeParse({ ...base, recurrenceEnd: "12/2029" });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.recurrenceEnd).toBe("2029-12");
  });

  it("vazio = sem prazo", () => {
    const p = purchaseSchema.safeParse({ ...base, recurrenceEnd: "" });
    expect(p.success && p.data.recurrenceEnd).toBe(null);
  });

  it("recusa mês final antes da compra e prazo acima de 10 anos", () => {
    expect(purchaseSchema.safeParse({ ...base, recurrenceEnd: "2026-10" }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, recurrenceEnd: "2037-01" }).success).toBe(false);
  });
});
