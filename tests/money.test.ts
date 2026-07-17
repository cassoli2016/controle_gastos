import { describe, it, expect } from "vitest";
import { decimalToCents, centsToNumber, sumCents, formatCents, parseBRLToCents } from "@/lib/money";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("money", () => {
  it("decimalToCents", () => {
    expect(decimalToCents(1383.42)).toBe(138342);
    expect(decimalToCents("220")).toBe(22000);
    expect(decimalToCents(0)).toBe(0);
  });
  it("centsToNumber", () => {
    expect(centsToNumber(138342)).toBeCloseTo(1383.42, 2);
  });
  it("sumCents", () => {
    expect(sumCents([100, 200, 50])).toBe(350);
    expect(sumCents([])).toBe(0);
  });
  it("formatCents em BRL", () => {
    expect(norm(formatCents(138342))).toBe("R$ 1.383,42");
    expect(norm(formatCents(0))).toBe("R$ 0,00");
  });
  it("parseBRLToCents aceita formatos variados", () => {
    expect(parseBRLToCents("1.383,42")).toBe(138342);
    expect(parseBRLToCents("1383.42")).toBe(138342);
    expect(parseBRLToCents(" R$ 449 ")).toBe(44900);
    expect(parseBRLToCents(" 449")).toBe(44900);
  });
  it("parseBRLToCents lança em valor inválido", () => {
    expect(() => parseBRLToCents("abc")).toThrow();
  });
});
