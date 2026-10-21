import { describe, it, expect } from "vitest";
import { decimalToCents, centsToNumber, sumCents, formatCents, parseBRLToCents, normalizeBRLNumber } from "@/lib/money";

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
  it("ponto de milhar sem vírgula é milhar, não decimal", () => {
    // "reserva 1.500" virava R$ 1,50; "1.299" virava R$ 1,30.
    expect(parseBRLToCents("1.299")).toBe(129900);
    expect(parseBRLToCents("1.500")).toBe(150000);
    expect(parseBRLToCents("12.345.678")).toBe(1234567800);
    // Decimal com ponto continua decimal: uma ou duas casas.
    expect(parseBRLToCents("54.9")).toBe(5490);
    expect(parseBRLToCents("1299.90")).toBe(129990);
  });
  it("normalizeBRLNumber", () => {
    expect(normalizeBRLNumber("1.383,42")).toBe("1383.42");
    expect(normalizeBRLNumber("1.299")).toBe("1299");
    expect(normalizeBRLNumber("-1.299")).toBe("-1299");
    expect(normalizeBRLNumber("54.9")).toBe("54.9");
    expect(normalizeBRLNumber("300")).toBe("300");
  });
  it("parseBRLToCents lança em valor inválido", () => {
    expect(() => parseBRLToCents("abc")).toThrow();
  });
});

describe("decimalToCents guard", () => {
  it("lança para entrada não numérica", () => {
    expect(() => decimalToCents("abc")).toThrow(/abc/);
    expect(() => decimalToCents(Number.NaN)).toThrow();
  });
  it("continua convertendo números válidos", () => {
    expect(decimalToCents("1383.42")).toBe(138342);
  });
});
