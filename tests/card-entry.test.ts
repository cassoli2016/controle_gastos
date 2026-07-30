import { describe, it, expect } from "vitest";
import { shouldDropZeroedCardEntry, upcomingCardCommitments } from "@/lib/card-entry";

describe("shouldDropZeroedCardEntry", () => {
  it("zerado, não pago, sem extrato → true", () => {
    expect(shouldDropZeroedCardEntry(0, false, 0)).toBe(true);
  });

  it("zerado, não pago, com extrato restante (estorno: compra + devolução de mesmo valor) → false", () => {
    expect(shouldDropZeroedCardEntry(0, false, 2)).toBe(false);
  });

  it("zerado, pago (histórico) → false", () => {
    expect(shouldDropZeroedCardEntry(0, true, 0)).toBe(false);
  });

  it("total diferente de zero, sem extrato → false", () => {
    expect(shouldDropZeroedCardEntry(1500, false, 0)).toBe(false);
  });

  it("total negativo (antecipação maior que a fatura), sem extrato → false", () => {
    expect(shouldDropZeroedCardEntry(-1000, false, 0)).toBe(false);
  });
});

describe("upcomingCardCommitments", () => {
  it("agrupa por mês, soma cartões e ordena", () => {
    expect(
      upcomingCardCommitments([
        { month: "2026-09", plannedCents: 10000 },
        { month: "2026-08", plannedCents: 25000 },
        { month: "2026-08", plannedCents: 10000 },
      ]),
    ).toEqual([
      { month: "2026-08", totalCents: 35000 },
      { month: "2026-09", totalCents: 10000 },
    ]);
  });
  it("mês zerado (antecipação cobre a fatura) fica de fora", () => {
    expect(
      upcomingCardCommitments([
        { month: "2026-08", plannedCents: 5000 },
        { month: "2026-08", plannedCents: -5000 },
      ]),
    ).toEqual([]);
  });
  it("vazio → vazio", () => expect(upcomingCardCommitments([])).toEqual([]));
});
