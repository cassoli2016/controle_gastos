import { describe, it, expect } from "vitest";
import { categorySchema, itemSchema, entryUpsertSchema, markPaidSchema } from "@/lib/validators";

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
});
