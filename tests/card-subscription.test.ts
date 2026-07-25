import { describe, it, expect } from "vitest";
import { descriptionsMatch, firstChargeFaturaMonth } from "@/lib/card-subscription";

describe("descriptionsMatch", () => {
  it("iguais sem caixa/acentos", () => {
    expect(descriptionsMatch("YouTube Premium", "youtube premium")).toBe(true);
    expect(descriptionsMatch("Assinatura Música", "assinatura musica")).toBe(true);
  });
  it("uma contém a outra (nome do estabelecimento no CSV)", () => {
    expect(descriptionsMatch("Google YouTube Premium", "YouTube Premium")).toBe(true);
    expect(descriptionsMatch("youtube", "YouTube Premium")).toBe(true);
  });
  it("diferentes não casam", () => {
    expect(descriptionsMatch("Spotify", "YouTube Premium")).toBe(false);
    expect(descriptionsMatch("", "YouTube")).toBe(false);
  });
});

describe("firstChargeFaturaMonth (fechamento dia 5)", () => {
  const card = { id: "c", name: "Nubank", closingDay: 5 };
  it("cobrança dia 10, hoje dia 19/07: próxima cobrança 10/08 → fatura set", () => {
    expect(firstChargeFaturaMonth(card, 10, "2026-07-19")).toBe("2026-09");
  });
  it("cobrança dia 25, hoje dia 19/07: próxima cobrança 25/07 → fatura ago", () => {
    expect(firstChargeFaturaMonth(card, 25, "2026-07-19")).toBe("2026-08");
  });
  it("cobrança dia 3, hoje 19/12: cobrança 03/01 → fatura jan do ano seguinte", () => {
    expect(firstChargeFaturaMonth(card, 3, "2026-12-19")).toBe("2027-01");
  });
  it("cartão sem fechamento usa o mês da cobrança", () => {
    expect(firstChargeFaturaMonth({ ...card, closingDay: null }, 25, "2026-07-19")).toBe("2026-07");
  });
});

describe("firstChargeFaturaMonth com vencimento antes do fechamento (fecha 27, vence 10)", () => {
  const bradesco = { id: "b", name: "Bradesco Amazon", closingDay: 27, dueDay: 10 };
  it("cobrança dia 15, hoje 25/07: cobra 15/08 → fecha 27/08 → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 15, "2026-07-25")).toBe("2026-09");
  });
  it("cobrança dia 28, hoje 25/07: cobra 28/07 (após o fechamento) → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 28, "2026-07-25")).toBe("2026-09");
  });
  it("cobrança dia 3, hoje 25/07: cobra 03/08 → fecha 27/08 → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 3, "2026-07-25")).toBe("2026-09");
  });
});
