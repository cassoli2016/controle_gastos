import { describe, it, expect } from "vitest";
import { pickFaturaMonth } from "@/lib/csv-fatura-target";

describe("pickFaturaMonth", () => {
  it("elege o mês com mais linhas", () => {
    // Caso real do Nubank: 63 linhas na fatura aberta + 5 resíduos do corte
    // intradiário caindo no mês já fechado.
    const m = new Map<string, unknown[]>([
      ["2026-08", [1, 2, 3, 4, 5]],
      ["2026-09", new Array(63).fill(0)],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-09");
  });

  it("no empate, vence o mês mais recente", () => {
    const m = new Map<string, unknown[]>([
      ["2026-08", [1, 2]],
      ["2026-09", [1, 2]],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-09");
  });

  it("independe da ordem de inserção no empate", () => {
    const m = new Map<string, unknown[]>([
      ["2026-09", [1, 2]],
      ["2026-08", [1, 2]],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-09");
  });

  it("mapa vazio devolve null", () => {
    expect(pickFaturaMonth(new Map())).toBeNull();
  });

  it("um mês só é ele mesmo", () => {
    expect(pickFaturaMonth(new Map([["2026-09", [1]]]))).toBe("2026-09");
  });
});

describe("pickFaturaMonth — caso do CSV de 12/10/2026", () => {
  it("o dia partido não desloca a fatura: vence o mês com mais linhas", () => {
    // Nubank_20261012.csv: 64 compras de 05/09 (→ out) e 7 de 04/09 (→ set,
    // pela data). Todas pertencem à fatura de outubro; o corte intradiário do
    // banco é que deixa o dia 4 dos dois lados.
    const m = new Map<string, unknown[]>([
      ["2026-09", new Array(7).fill(0)],
      ["2026-10", new Array(64).fill(0)],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-10");
  });
});
