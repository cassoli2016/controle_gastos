import { describe, it, expect } from "vitest";
import { parseReceiptExtraction, buildBotText } from "@/lib/receipt-vision";

describe("parseReceiptExtraction", () => {
  it("JSON limpo", () => {
    expect(parseReceiptExtraction('{"description":"Padaria Pão Quente","amount":34.5,"installments":null,"card":null}')).toEqual({
      description: "Padaria Pão Quente",
      amountReais: 34.5,
      installments: null,
      cardHint: null,
    });
  });
  it("cerca markdown e texto em volta", () => {
    const raw = 'Claro! Aqui está:\n```json\n{"description":"Posto Shell","amount":200,"installments":3,"card":"nubank"}\n```';
    expect(parseReceiptExtraction(raw)).toEqual({
      description: "Posto Shell",
      amountReais: 200,
      installments: 3,
      cardHint: "nubank",
    });
  });
  it("amount como string numérica é aceito", () => {
    const r = parseReceiptExtraction('{"description":"Uber","amount":"23.90","installments":null,"card":null}');
    expect(r).toMatchObject({ amountReais: 23.9 });
  });
  it("installments 1 vira null (à vista)", () => {
    const r = parseReceiptExtraction('{"description":"Mercado","amount":50,"installments":1,"card":null}');
    expect(r).toMatchObject({ installments: null });
  });
  it("sem JSON → erro", () => {
    expect(parseReceiptExtraction("não consegui ler a imagem")).toHaveProperty("error");
  });
  it("amount inválido/zero → erro", () => {
    expect(parseReceiptExtraction('{"description":"X","amount":0,"installments":null,"card":null}')).toHaveProperty("error");
    expect(parseReceiptExtraction('{"description":"X","amount":"abc","installments":null,"card":null}')).toHaveProperty("error");
  });
  it("descrição vazia ou gigante → erro", () => {
    expect(parseReceiptExtraction('{"description":"","amount":10,"installments":null,"card":null}')).toHaveProperty("error");
    expect(parseReceiptExtraction(`{"description":"${"a".repeat(100)}","amount":10,"installments":null,"card":null}`)).toHaveProperty("error");
  });
});

describe("buildBotText", () => {
  // A visão devolve o TOTAL (200); a linha do bot fala em valor POR PARCELA.
  const base = { description: "Posto Shell", amountReais: 200, installments: 3, cardHint: "nubank" };
  it("sem caption usa as dicas extraídas, com valor por parcela (total ÷ N)", () =>
    expect(buildBotText(base, undefined)).toBe("Posto Shell 66.67 nubank 3x"));
  it("caption só com o cartão NÃO descarta as parcelas extraídas", () =>
    expect(buildBotText(base, "nubank")).toBe("Posto Shell 66.67 nubank 3x"));
  it("caption com cartão e Nx vence a extração nas duas dicas", () =>
    expect(buildBotText(base, "bradesco 5x")).toBe("Posto Shell 40 bradesco 5x"));
  it("caption só com Nx mantém o cartão extraído", () =>
    expect(buildBotText(base, "5x")).toBe("Posto Shell 40 nubank 5x"));
  it("divisão arredonda por centavos (138.98 em 3x → 46.33)", () =>
    expect(
      buildBotText({ description: "Mercado Livre", amountReais: 138.98, installments: 3, cardHint: null }, "nubank"),
    ).toBe("Mercado Livre 46.33 nubank 3x"));
  it("à vista com caption de cartão: sem Nx e valor cheio", () =>
    expect(
      buildBotText({ description: "Padaria", amountReais: 34.5, installments: null, cardHint: null }, "nubank"),
    ).toBe("Padaria 34.5 nubank"));
  it("sem dicas nenhuma: só descrição e valor", () =>
    expect(buildBotText({ description: "Uber", amountReais: 23.9, installments: null, cardHint: null }, undefined)).toBe(
      "Uber 23.9",
    ));
  it("palavras extras da caption (ex.: mensal) continuam passando para o parser", () =>
    expect(
      buildBotText({ description: "Spotify", amountReais: 21.9, installments: null, cardHint: null }, "mensal"),
    ).toBe("Spotify 21.9 mensal"));
});
