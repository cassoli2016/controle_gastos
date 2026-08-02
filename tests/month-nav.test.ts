import { describe, it, expect } from "vitest";
import { shiftMonth, monthLabel, monthGrid } from "@/lib/month-nav";

describe("shiftMonth", () => {
  it("avança e volta dentro do ano", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  });

  it("dezembro + 1 vira janeiro do ano seguinte", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("janeiro − 1 volta para dezembro do ano anterior", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("salto maior que um ano", () => {
    expect(shiftMonth("2026-08", 14)).toBe("2027-10");
  });
});

describe("monthLabel", () => {
  it("formata capitalizado em pt-BR", () => {
    expect(monthLabel("2026-08")).toBe("Agosto 2026");
  });

  it("mês com acento", () => {
    expect(monthLabel("2026-03")).toBe("Março 2026");
  });
});

describe("monthGrid", () => {
  const grade = monthGrid(2026);

  it("tem os 12 meses do ano", () => {
    expect(grade).toHaveLength(12);
    expect(grade[0]).toEqual({ monthISO: "2026-01", short: "jan" });
    expect(grade[11]).toEqual({ monthISO: "2026-12", short: "dez" });
  });

  it("rótulos minúsculos de três letras", () => {
    expect(grade.map((g) => g.short)).toEqual([
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ]);
  });
});
