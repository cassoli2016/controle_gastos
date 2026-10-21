import { describe, it, expect } from "vitest";
import { goalProgress, goalSentence, monthsBetween } from "@/lib/reserve-goal";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("monthsBetween", () => {
  it("conta os meses entre duas competências", () => {
    expect(monthsBetween("2026-10", "2027-08")).toBe(10);
    expect(monthsBetween("2026-10", "2026-10")).toBe(0);
    expect(monthsBetween("2026-10", "2026-08")).toBe(-2);
  });
});

describe("goalProgress", () => {
  it("percentual, falta e ritmo por mês", () => {
    const p = goalProgress(2_003_019, 3_000_000, "2027-08", "2026-10");
    expect(p.pct).toBe(67);
    expect(p.remainingCents).toBe(996_981);
    expect(p.reached).toBe(false);
    expect(p.monthsLeft).toBe(10);
    expect(p.perMonthCents).toBe(99_699);
  });
  it("meta atingida trava em 100% e não pede ritmo", () => {
    const p = goalProgress(3_100_000, 3_000_000, "2027-08", "2026-10");
    expect(p.pct).toBe(100);
    expect(p.reached).toBe(true);
    expect(p.perMonthCents).toBeNull();
  });
  it("prazo vencido conta como este mês", () => {
    const p = goalProgress(100, 1_000, "2026-08", "2026-10");
    expect(p.monthsLeft).toBe(0);
    expect(p.perMonthCents).toBe(900);
  });
  it("sem prazo não há ritmo", () => {
    expect(goalProgress(100, 1_000, null, "2026-10").perMonthCents).toBeNull();
  });
});

describe("goalSentence", () => {
  it("com prazo", () => {
    expect(norm(goalSentence(goalProgress(2_003_019, 3_000_000, "2027-08", "2026-10"), "ago/27"))).toBe(
      "Faltam R$ 9.969,81: R$ 996,99 por mês até ago/27.",
    );
  });
  it("sem prazo", () => {
    expect(norm(goalSentence(goalProgress(100, 1_000, null, "2026-10"), null))).toBe("Faltam R$ 9,00.");
  });
  it("prazo este mês", () => {
    expect(norm(goalSentence(goalProgress(100, 1_000, "2026-10", "2026-10"), "out/26"))).toBe("Faltam R$ 9,00; o prazo é este mês.");
  });
  it("atingida", () => {
    expect(goalSentence(goalProgress(1_000, 1_000, null, "2026-10"), null)).toBe("Meta atingida.");
  });
});
