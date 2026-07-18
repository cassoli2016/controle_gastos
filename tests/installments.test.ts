import { describe, it, expect } from "vitest";
import { installmentMonths } from "@/lib/installments";

describe("installmentMonths", () => {
  it("gera a sequência de competências a partir do mês inicial", () => {
    expect(installmentMonths("2026-08", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
  it("count 1 retorna somente o mês inicial", () => {
    expect(installmentMonths("2026-08", 1)).toEqual(["2026-08"]);
  });
  it("count 0 retorna lista vazia", () => {
    expect(installmentMonths("2026-08", 0)).toEqual([]);
  });
  it("vira o ano corretamente", () => {
    expect(installmentMonths("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});
