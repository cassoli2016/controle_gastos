import { describe, it, expect } from "vitest";
import { monthToDate, monthStringFromDate, formatCompetencia, monthRange } from "@/lib/dates";

describe("dates", () => {
  it("monthToDate cria dia 1 UTC", () => {
    const d = monthToDate("2026-08");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(1);
  });
  it("monthStringFromDate", () => {
    expect(monthStringFromDate(new Date(Date.UTC(2026, 7, 1)))).toBe("2026-08");
  });
  it("formatCompetencia em pt-BR", () => {
    expect(formatCompetencia(new Date(Date.UTC(2026, 7, 1))).toLowerCase()).toContain("ago");
  });
});

describe("monthRange", () => {
  it("intervalo inclusivo", () => {
    expect(monthRange("2026-08", "2026-11")).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  });
  it("mês único e intervalo invertido", () => {
    expect(monthRange("2026-08", "2026-08")).toEqual(["2026-08"]);
    expect(monthRange("2026-11", "2026-08")).toEqual([]);
  });
});
