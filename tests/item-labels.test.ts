import { describe, it, expect } from "vitest";
import { frequencyLabel, dueLabel } from "@/lib/items-filter";

describe("frequencyLabel", () => {
  it("nomeia as cadências comuns", () => {
    expect(frequencyLabel(1)).toBe("mensal");
    expect(frequencyLabel(2)).toBe("bimestral");
    expect(frequencyLabel(3)).toBe("trimestral");
    expect(frequencyLabel(6)).toBe("semestral");
    expect(frequencyLabel(12)).toBe("anual");
  });
  it("cadência fora da lista vira 'a cada N meses'", () => {
    expect(frequencyLabel(5)).toBe("a cada 5 meses");
  });
});

describe("dueLabel", () => {
  it("dia útil vence o dia fixo", () => {
    expect(dueLabel(10, 5)).toBe("5º dia útil");
  });
  it("dia fixo", () => {
    expect(dueLabel(10, null)).toBe("dia 10");
  });
  it("sem data", () => {
    expect(dueLabel(null, null)).toBe("—");
  });
});
