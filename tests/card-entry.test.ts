import { describe, it, expect } from "vitest";
import { shouldDropZeroedCardEntry } from "@/lib/card-entry";

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
