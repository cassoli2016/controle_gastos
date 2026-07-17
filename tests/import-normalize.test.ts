import { describe, it, expect } from "vitest";
import { normalizeAmount, normalizeDueDay, keywordCategory } from "@/lib/import-normalize";

describe("import-normalize", () => {
  it("normalizeAmount trata número, string, NBSP e vazio", () => {
    expect(normalizeAmount(220)).toBe(220);
    expect(normalizeAmount(" 449")).toBe(449);
    expect(normalizeAmount("1.383,42")).toBe(1383.42);
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount(null)).toBeNull();
  });
  it("normalizeDueDay aceita string/número, rejeita fora de 1..31", () => {
    expect(normalizeDueDay("5")).toBe(5);
    expect(normalizeDueDay(7)).toBe(7);
    expect(normalizeDueDay(0)).toBeNull();
    expect(normalizeDueDay(40)).toBeNull();
    expect(normalizeDueDay("")).toBeNull();
  });
  it("keywordCategory mapeia por palavra-chave", () => {
    expect(keywordCategory("SALÁRIO")).toBe("Renda");
    expect(keywordCategory("SEGURO DUSTER 27/08")).toBe("Seguros");
    expect(keywordCategory("YOUTUBE")).toBe("Assinaturas");
    expect(keywordCategory("HANA TIREÓIDE")).toBe("Saúde");
    expect(keywordCategory("ESTACIONAMENTO")).toBe("Transporte");
    expect(keywordCategory("ALGO ALEATÓRIO")).toBe("Outros");
  });
});
