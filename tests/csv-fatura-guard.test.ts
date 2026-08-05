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
