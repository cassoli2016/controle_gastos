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

  // Regressão real (26/07/2026): a data veio sem os "de" e o parser perdeu a
  // data E o cartão — a compra virou avulsa, no mês errado, fora da fatura.
  it('data sem os "de" ainda é entendida', () => {
    const text = "Drogarias Pacheco\nR$ 263,77\nem 3x de R$ 87,92\nDomingo, 26 julho 2026, 10:08\nCartão Nubank";
    const { purchases, failedLines } = parseNubankShares(text);
    expect(failedLines).toEqual([]);
    expect(purchases).toEqual([
      {
        description: "Drogarias Pacheco",
        amountReais: 87.92,
        installments: 3,
        date: "2026-07-26",
        cardHint: "nubank",
      },
    ]);
  });

  it("linha desconhecida no meio do bloco não faz perder o que vem depois", () => {
    const text = "Padaria\nR$ 12,00\nlinha que o app não conhece\nCartão Nubank";
    const { purchases } = parseNubankShares(text);
    expect(purchases[0].cardHint).toBe("nubank");
  });

  it("linha desconhecida é reportada, para o bot poder avisar", () => {
    const text = "Padaria\nR$ 12,00\nlinha que o app não conhece\nCartão Nubank";
    const { failedLines } = parseNubankShares(text);
    expect(failedLines).toEqual(["linha que o app não conhece"]);
  });

  it("linha desconhecida não engole o bloco seguinte", () => {
    const text = `Padaria\nR$ 12,00\nlinha estranha\nCartão Nubank\n${A_VISTA}`;
    const { purchases } = parseNubankShares(text);
    expect(purchases).toHaveLength(2);
    expect(purchases[1].description).toBe("Casa China Americas");
    expect(purchases[1].date).toBe("2026-07-19");
  });
});
