import { describe, it, expect } from "vitest";
import { horizonCells, horizonHeadline } from "@/lib/horizon";

const norm = (s: string) => s.replace(/[  ]/g, " ");
const pts = [
  { month: "2026-10", balanceCents: -162700 },
  { month: "2026-11", balanceCents: -894651 },
  { month: "2026-12", balanceCents: 500000 },
  { month: "2027-01", balanceCents: 0 },
];

describe("horizonCells", () => {
  it("razão relativa ao maior módulo, rótulo curto, mês corrente marcado", () => {
    const cells = horizonCells(pts, "2026-10");
    expect(cells[1].ratio).toBe(-1);
    expect(cells[2].ratio).toBeCloseTo(500000 / 894651, 5);
    expect(cells[3].ratio).toBe(0);
    expect(cells[0].label).toBe("out/26");
    expect(cells[0].current).toBe(true);
    expect(cells[1].current).toBe(false);
  });
  it("tudo zero não divide por zero", () => {
    expect(horizonCells([{ month: "2026-10", balanceCents: 0 }], "2026-10")[0].ratio).toBe(0);
  });
});

describe("horizonHeadline", () => {
  it("conta os meses no vermelho e aponta o mais apertado", () => {
    expect(norm(horizonHeadline(horizonCells(pts, "2026-10")))).toBe(
      "2 dos próximos 4 meses fecham no vermelho; o mais apertado é nov/26, faltando R$ 8.946,51.",
    );
  });
  it("um só mês no vermelho concorda o verbo", () => {
    const cells = horizonCells([{ month: "2026-10", balanceCents: -100 }, { month: "2026-11", balanceCents: 100 }], "2026-10");
    expect(norm(horizonHeadline(cells))).toBe("1 dos próximos 2 meses fecha no vermelho; o mais apertado é out/26, faltando R$ 1,00.");
  });
  it("sem vermelho", () => {
    const cells = horizonCells([{ month: "2026-10", balanceCents: 100 }, { month: "2026-11", balanceCents: 100 }], "2026-10");
    expect(horizonHeadline(cells)).toBe("Os próximos 2 meses fecham no azul.");
  });
});
