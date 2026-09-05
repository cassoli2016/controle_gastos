import { describe, it, expect } from "vitest";
import { cardCycleStatus } from "@/lib/card-estimate";

const cards = [
  { id: "nu", name: "Nubank", estimateCents: 1000000 },
  { id: "bra", name: "Bradesco Amazon", estimateCents: 200000 },
];

describe("cardCycleStatus", () => {
  it("mostra quanto do teto o próximo ciclo já ocupou", () => {
    // Outubro já tem R$ 7.735,35 no Nubank — quase todo o teto, e o ciclo mal
    // começou.
    const s = cardCycleStatus(cards, "2026-09", { nu: 773535, bra: 184385 });
    expect(s).toEqual([
      { cardId: "nu", name: "Nubank", monthISO: "2026-10", bookedCents: 773535, limitCents: 1000000, remainingCents: 226465, pct: 77 },
      { cardId: "bra", name: "Bradesco Amazon", monthISO: "2026-10", bookedCents: 184385, limitCents: 200000, remainingCents: 15615, pct: 92 },
    ]);
  });

  it("ciclo que passou do teto tem restante zero e mais de 100%", () => {
    const [s] = cardCycleStatus([cards[0]], "2026-09", { nu: 1500000 });
    expect(s.remainingCents).toBe(0);
    expect(s.pct).toBe(150);
  });

  it("cartão sem teto fica de fora — não há com o que comparar", () =>
    expect(cardCycleStatus([{ id: "x", name: "Sem teto", estimateCents: null }], "2026-09", {})).toEqual([]));

  it("ciclo sem nada lançado ainda mostra o teto inteiro disponível", () => {
    const [s] = cardCycleStatus([cards[0]], "2026-09", {});
    expect(s).toMatchObject({ bookedCents: 0, remainingCents: 1000000, pct: 0 });
  });

  it("o ciclo acompanhado é sempre o mês seguinte: a fatura do mês corrente já fechou", () =>
    expect(cardCycleStatus([cards[0]], "2026-12", {})[0].monthISO).toBe("2027-01"));
});
