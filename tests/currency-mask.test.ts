import { describe, it, expect } from "vitest";
import { digitsToCents, centsToReais } from "@/lib/currency-mask";

describe("currency-mask", () => {
  it("digitsToCents lê apenas dígitos como centavos", () => {
    expect(digitsToCents("12345")).toBe(12345);
    expect(digitsToCents("R$ 1.234,50")).toBe(123450);
    expect(digitsToCents("")).toBe(0);
    expect(digitsToCents("abc")).toBe(0);
    expect(digitsToCents("007")).toBe(7);
  });
  it("centsToReais converte centavos em reais", () => {
    expect(centsToReais(123450)).toBeCloseTo(1234.5, 2);
    expect(centsToReais(0)).toBe(0);
  });
});
