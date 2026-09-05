import { describe, it, expect } from "vitest";
import { cardEstimateCents, cardEstimateLines } from "@/lib/card-estimate";

const NOW = "2026-09";

describe("cardEstimateCents", () => {
  it("completa o que falta para a estimativa", () => {
    // out/2026 tem R$ 9.579,20 de parcelas lançadas; com estimativa de
    // R$ 20.000, faltam R$ 10.420,80 de compras que ainda vão acontecer.
    expect(cardEstimateCents({ monthISO: "2026-10", currentMonth: NOW, estimateCents: 2000000, bookedCents: 957920 })).toBe(1042080);
  });

  it("mês sem parcela nenhuma provisiona a estimativa inteira", () =>
    expect(cardEstimateCents({ monthISO: "2027-06", currentMonth: NOW, estimateCents: 2000000, bookedCents: 0 })).toBe(2000000));

  it("fatura já maior que a estimativa não provisiona nada", () => {
    // Não se inventa despesa por cima do que já se sabe.
    expect(cardEstimateCents({ monthISO: "2026-10", currentMonth: NOW, estimateCents: 2000000, bookedCents: 2400000 })).toBe(0);
  });

  it("mês corrente não provisiona: a fatura dele já está formada", () =>
    expect(cardEstimateCents({ monthISO: NOW, currentMonth: NOW, estimateCents: 2000000, bookedCents: 100 })).toBe(0));

  it("mês passado não provisiona", () =>
    expect(cardEstimateCents({ monthISO: "2026-08", currentMonth: NOW, estimateCents: 2000000, bookedCents: 0 })).toBe(0));

  it("cartão sem estimativa configurada não provisiona", () => {
    expect(cardEstimateCents({ monthISO: "2027-01", currentMonth: NOW, estimateCents: null, bookedCents: 0 })).toBe(0);
    expect(cardEstimateCents({ monthISO: "2027-01", currentMonth: NOW, estimateCents: 0, bookedCents: 0 })).toBe(0);
  });
});

describe("cardEstimateLines", () => {
  const cards = [
    { id: "c1", name: "Nubank", estimateCents: 1800000 },
    { id: "c2", name: "Bradesco Amazon", estimateCents: 400000 },
  ];

  it("uma linha por cartão com estimativa a completar", () => {
    const linhas = cardEstimateLines(cards, "2026-11", NOW, { c1: 500000, c2: 100000 });
    expect(linhas).toEqual([
      { cardId: "c1", line: "Nubank · compras estimadas", cents: 1300000 },
      { cardId: "c2", line: "Bradesco Amazon · compras estimadas", cents: 300000 },
    ]);
  });

  it("cartão sem estimativa fica de fora", () => {
    const linhas = cardEstimateLines([{ id: "c3", name: "Sem meta", estimateCents: null }], "2026-11", NOW, {});
    expect(linhas).toEqual([]);
  });

  it("cartão cuja fatura já passou da estimativa fica de fora", () =>
    expect(cardEstimateLines(cards, "2026-11", NOW, { c1: 9999999, c2: 9999999 })).toEqual([]));

  it("no mês corrente não há linha nenhuma", () =>
    expect(cardEstimateLines(cards, NOW, NOW, {})).toEqual([]));
});
