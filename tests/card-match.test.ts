import { describe, it, expect } from "vitest";
import { matchCardsByFileName } from "@/lib/card-match";

const CARDS = [
  { id: "1", name: "Nubank" },
  { id: "2", name: "Itaú Click" },
];

describe("matchCardsByFileName", () => {
  it("nome do cartão contido no nome do arquivo", () => {
    expect(matchCardsByFileName("nubank-2026-08-04.csv", CARDS)).toEqual([CARDS[0]]);
    expect(matchCardsByFileName("Nubank Fatura Agosto.csv", CARDS)).toEqual([CARDS[0]]);
  });
  it("acentos e caixa não importam (Itaú → itau)", () => {
    expect(matchCardsByFileName("fatura-itau-agosto.csv", CARDS)).toEqual([CARDS[1]]);
    expect(matchCardsByFileName("ITAU_2026.csv", CARDS)).toEqual([CARDS[1]]);
  });
  it("palavra parcial do nome composto também casa (Click)", () => {
    expect(matchCardsByFileName("click-agosto.csv", CARDS)).toEqual([CARDS[1]]);
  });
  it("sem correspondência retorna vazio", () => {
    expect(matchCardsByFileName("extrato-2026.csv", CARDS)).toEqual([]);
    expect(matchCardsByFileName(undefined, CARDS)).toEqual([]);
  });
  it("nome que casa dois cartões retorna ambos (ambíguo)", () => {
    const cards = [
      { id: "1", name: "Nubank Cristian" },
      { id: "2", name: "Nubank Empresa" },
    ];
    expect(matchCardsByFileName("nubank-agosto.csv", cards)).toHaveLength(2);
  });
});
