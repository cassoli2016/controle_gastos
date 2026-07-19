import { describe, it, expect } from "vitest";
import { parseNubankShares, isNubankShareFormat } from "@/lib/nubank-share";

const A_VISTA = "Casa China Americas\nR$ 6,99\nDomingo, 19 de Julho de 2026, 11:30\nCartão Nubank";

const PARCELADA =
  "Mercado Livre\nR$ 213,19\nem 6x de R$ 35,53\nSexta-feira, 17 de Julho de 2026, 11:15\nCartão Nubank";

describe("isNubankShareFormat", () => {
  it("detecta pela linha de valor isolada (R$ …)", () => {
    expect(isNubankShareFormat(A_VISTA)).toBe(true);
    expect(isNubankShareFormat(PARCELADA)).toBe(true);
  });
  it("formato compacto não é share", () => {
    expect(isNubankShareFormat("almoço 42,50 nubank")).toBe(false);
    expect(isNubankShareFormat("ifood 54,90 nubank\nuber 23,40")).toBe(false);
  });
});

describe("parseNubankShares", () => {
  it("compra à vista", () => {
    const { purchases, failedLines } = parseNubankShares(A_VISTA);
    expect(failedLines).toEqual([]);
    expect(purchases).toEqual([
      {
        description: "Casa China Americas",
        amountReais: 6.99,
        installments: 1,
        date: "2026-07-19",
        cardHint: "nubank",
      },
    ]);
  });

  it("compra parcelada usa o valor POR parcela", () => {
    const { purchases } = parseNubankShares(PARCELADA);
    expect(purchases).toEqual([
      {
        description: "Mercado Livre",
        amountReais: 35.53,
        installments: 6,
        date: "2026-07-17",
        cardHint: "nubank",
      },
    ]);
  });

  it("vários blocos colados na mesma mensagem", () => {
    const { purchases } = parseNubankShares(`${A_VISTA}\n\n${PARCELADA}`);
    expect(purchases).toHaveLength(2);
    expect(purchases[0].description).toBe("Casa China Americas");
    expect(purchases[1].installments).toBe(6);
  });

  it("mês com acento e outra capitalização", () => {
    const text = "Padaria\nR$ 12,00\nQuarta-feira, 4 de Março de 2026, 08:00\nCartão Itaú";
    const { purchases } = parseNubankShares(text);
    expect(purchases[0].date).toBe("2026-03-04");
    expect(purchases[0].cardHint).toBe("itaú");
  });

  it("bloco sem descrição antes do valor vai para failedLines", () => {
    const { purchases, failedLines } = parseNubankShares("R$ 6,99\nCartão Nubank");
    expect(purchases).toEqual([]);
    expect(failedLines.length).toBeGreaterThan(0);
  });
});
