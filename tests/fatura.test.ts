import { describe, it, expect } from "vitest";
import { faturaMonth, cardTargetMonth, todayISOInSaoPaulo, nthBusinessDay } from "@/lib/fatura";

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

describe("faturaMonth com vencimento — Bradesco Amazon (fecha 27, vence 10)", () => {
  it("compra até o fechamento é paga no mês seguinte", () => {
    expect(faturaMonth("2026-07-01", 27, 10)).toBe("2026-08");
    expect(faturaMonth("2026-07-25", 27, 10)).toBe("2026-08");
    expect(faturaMonth("2026-07-27", 27, 10)).toBe("2026-08");
  });
  it("compra após o fechamento pula uma fatura", () => {
    expect(faturaMonth("2026-07-28", 27, 10)).toBe("2026-09");
    expect(faturaMonth("2026-07-31", 27, 10)).toBe("2026-09");
  });
  it("virada de ano", () => {
    expect(faturaMonth("2026-12-20", 27, 10)).toBe("2027-01");
    expect(faturaMonth("2026-12-28", 27, 10)).toBe("2027-02");
  });
});

describe("faturaMonth com vencimento — Nubank (fecha 4, vence 10)", () => {
  it("vencimento depois do fechamento mantém o mês do fechamento", () => {
    expect(faturaMonth("2026-07-03", 4, 10)).toBe("2026-07");
    expect(faturaMonth("2026-07-04", 4, 10)).toBe("2026-07");
    expect(faturaMonth("2026-07-25", 4, 10)).toBe("2026-08");
  });
  it("resultado idêntico ao de antes do vencimento existir", () => {
    expect(faturaMonth("2026-07-25", 4, 10)).toBe(faturaMonth("2026-07-25", 4));
    expect(faturaMonth("2026-07-03", 4, 10)).toBe(faturaMonth("2026-07-03", 4));
  });
});

describe("faturaMonth — bordas do vencimento", () => {
  it("vencimento ausente ou nulo mantém o comportamento antigo", () => {
    expect(faturaMonth("2026-07-25", 27)).toBe("2026-07");
    expect(faturaMonth("2026-07-25", 27, null)).toBe("2026-07");
  });
  it("vencimento igual ao fechamento conta como mês seguinte", () => {
    expect(faturaMonth("2026-07-25", 27, 27)).toBe("2026-08");
  });
  it("data inválida continua null mesmo com vencimento", () => {
    expect(faturaMonth("25/07/2026", 27, 10)).toBeNull();
    expect(faturaMonth("2026-13-01", 27, 10)).toBeNull();
  });
});

describe("cardTargetMonth", () => {
  const bradesco = { closingDay: 27, dueDay: 10 };
  it("aplica fechamento + vencimento", () => {
    expect(cardTargetMonth(bradesco, "2026-07-25", "2026-07")).toBe("2026-08");
  });
  it("cartão sem fechamento cai no mês-fallback", () => {
    expect(cardTargetMonth({ closingDay: null, dueDay: 10 }, "2026-07-25", "2026-07")).toBe("2026-07");
  });
  it("data inválida cai no mês-fallback", () => {
    expect(cardTargetMonth(bradesco, "25/07/2026", "2026-07")).toBe("2026-07");
  });
});
