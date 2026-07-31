import { describe, it, expect } from "vitest";
import { monthToDate, monthStringFromDate, formatCompetencia, monthRange, sanitizeMonth } from "@/lib/dates";

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

describe("sanitizeMonth", () => {
  it("aceita YYYY-MM válido", () => expect(sanitizeMonth("2026-08")).toBe("2026-08"));
  it("rejeita mês 13/00", () => {
    expect(sanitizeMonth("2026-13")).toBeNull();
    expect(sanitizeMonth("2026-00")).toBeNull();
  });
  it("rejeita lixo e formatos parciais", () => {
    expect(sanitizeMonth("abc")).toBeNull();
    expect(sanitizeMonth("2026-8")).toBeNull();
    expect(sanitizeMonth("2026-08-01")).toBeNull();
  });
  it("undefined → null", () => expect(sanitizeMonth(undefined)).toBeNull());
});
