import { describe, it, expect } from "vitest";
import { faturaMonth, todayISOInSaoPaulo, nthBusinessDay } from "@/lib/fatura";

describe("faturaMonth (fechamento dia 5)", () => {
  it("compra até o dia do fechamento cai na fatura do próprio mês", () => {
    expect(faturaMonth("2026-07-04", 5)).toBe("2026-07");
    expect(faturaMonth("2026-07-05", 5)).toBe("2026-07");
  });
  it("compra após o fechamento cai na fatura do mês seguinte", () => {
    expect(faturaMonth("2026-07-06", 5)).toBe("2026-08");
    expect(faturaMonth("2026-07-19", 5)).toBe("2026-08");
  });
  it("dezembro vira janeiro do ano seguinte", () => {
    expect(faturaMonth("2026-12-28", 5)).toBe("2027-01");
  });
  it("data inválida retorna null", () => {
    expect(faturaMonth("19/07/2026", 5)).toBeNull();
    expect(faturaMonth("", 5)).toBeNull();
    expect(faturaMonth("2026-13-01", 5)).toBeNull();
  });
});

describe("todayISOInSaoPaulo", () => {
  it("converte UTC para o dia em Brasília (UTC-3)", () => {
    // 02:00 UTC ainda é o dia anterior em São Paulo.
    expect(todayISOInSaoPaulo(new Date("2026-07-19T02:00:00Z"))).toBe("2026-07-18");
    expect(todayISOInSaoPaulo(new Date("2026-07-19T12:00:00Z"))).toBe("2026-07-19");
  });
});

describe("nthBusinessDay (5º dia útil)", () => {
  it("agosto/2026 começa num sábado: 5º dia útil = 07/08", () => {
    // 01/08/2026 = sábado; úteis: 3,4,5,6,7
    expect(nthBusinessDay("2026-08", 5)).toBe("2026-08-07");
  });
  it("setembro/2026 começa numa terça: 5º dia útil = 07/09", () => {
    // 01/09 ter, 02 qua, 03 qui, 04 sex, 05-06 fds, 07 seg
    expect(nthBusinessDay("2026-09", 5)).toBe("2026-09-07");
  });
  it("1º dia útil de agosto/2026 = 03/08 (segunda)", () => {
    expect(nthBusinessDay("2026-08", 1)).toBe("2026-08-03");
  });
});
