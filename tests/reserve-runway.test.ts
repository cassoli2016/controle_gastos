import { describe, it, expect } from "vitest";
import { reserveRunway, defaultRunwayMonth, toComeUntil } from "@/lib/reserve-runway";

describe("reserveRunway", () => {
  it("parte das caixinhas e acumula o saldo a realizar em ordem", () => {
    const r = reserveRunway(3453800, { "2026-12": -357232, "2026-11": 667300, "2027-01": 100000 }, "2026-11");
    expect(r.overdueCents).toBe(0);
    expect(r.points).toEqual([
      { month: "2026-11", toComeCents: 667300, accumulatedCents: 4121100 },
      { month: "2026-12", toComeCents: -357232, accumulatedCents: 3763868 },
      { month: "2027-01", toComeCents: 100000, accumulatedCents: 3863868 },
    ]);
  });

  it("mês passado quitado some; atrasado entra no mês corrente", () => {
    const r = reserveRunway(1000, { "2026-09": 0, "2026-10": -300, "2026-12": 50 }, "2026-11");
    expect(r.overdueCents).toBe(-300);
    expect(r.points).toEqual([
      { month: "2026-11", toComeCents: -300, accumulatedCents: 700 },
      { month: "2026-12", toComeCents: 50, accumulatedCents: 750 },
    ]);
  });

  it("sem meses à frente não há pontos", () => {
    expect(reserveRunway(1000, { "2026-09": 0 }, "2026-11").points).toEqual([]);
  });
});

describe("defaultRunwayMonth e toComeUntil", () => {
  const pts = ["2026-11", "2026-12", "2027-11", "2028-01"].map((month, i) => ({ month, toComeCents: (i + 1) * 100, accumulatedCents: 0 }));
  it("abre um ano à frente; sem ele, no último mês", () => {
    expect(defaultRunwayMonth(pts, "2026-11")).toBe("2027-11");
    expect(defaultRunwayMonth(pts.slice(0, 2), "2026-11")).toBe("2026-12");
    expect(defaultRunwayMonth([], "2026-11")).toBeNull();
  });
  it("soma do primeiro mês até o escolhido", () => {
    expect(toComeUntil(pts, "2026-12")).toBe(300);
    expect(toComeUntil(pts, "2028-01")).toBe(1000);
  });
});
