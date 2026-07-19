import { describe, it, expect } from "vitest";
import { calcPosition, calcPortfolio, formatPct } from "@/lib/investments";

describe("calcPosition", () => {
  it("posição com lucro (BBSE3 do usuário)", () => {
    // 1900 cotas, PM 34,9601, cotação 41,27
    const c = calcPosition({ quantity: 1900, avgPriceCents: 3496.01, lastPriceCents: 4127 });
    expect(c.costCents).toBe(6642419); // R$ 66.424,19
    expect(c.valueCents).toBe(7841300); // R$ 78.413,00
    expect(c.resultCents).toBe(1198881);
    expect(c.resultPct).toBeCloseTo(0.1804, 3);
  });
  it("sem cotação: valor e resultado nulos", () => {
    const c = calcPosition({ quantity: 100, avgPriceCents: 1000, lastPriceCents: null });
    expect(c.costCents).toBe(100000);
    expect(c.valueCents).toBeNull();
    expect(c.resultCents).toBeNull();
    expect(c.resultPct).toBeNull();
  });
});

describe("calcPortfolio", () => {
  it("soma custo/valor e conta cotações ausentes", () => {
    const t = calcPortfolio([
      { quantity: 100, avgPriceCents: 1000, lastPriceCents: 1200 }, // +20%
      { quantity: 100, avgPriceCents: 1000, lastPriceCents: null }, // entra pelo custo
    ]);
    expect(t.costCents).toBe(200000);
    expect(t.valueCents).toBe(220000);
    expect(t.resultCents).toBe(20000);
    expect(t.resultPct).toBeCloseTo(0.1, 5);
    expect(t.missingQuotes).toBe(1);
  });
  it("carteira vazia", () => {
    const t = calcPortfolio([]);
    expect(t.costCents).toBe(0);
    expect(t.resultPct).toBeNull();
  });
});

describe("formatPct", () => {
  it("formata com sinal e vírgula", () => {
    expect(formatPct(0.1804)).toBe("+18,04%");
    expect(formatPct(-0.0576)).toBe("-5,76%");
    expect(formatPct(null)).toBe("—");
  });
});
