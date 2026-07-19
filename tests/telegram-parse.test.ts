import { describe, it, expect } from "vitest";
import { parseExpenseMessage, parseExpenseLines } from "@/lib/telegram-parse";

describe("parseExpenseMessage", () => {
  it("descrição + valor", () => {
    expect(parseExpenseMessage("almoço 42,50")).toEqual({
      description: "almoço",
      amountReais: 42.5,
      installments: 1,
      cardHint: null,
      recurring: false,
    });
  });
  it("descrição + valor + cartão", () => {
    expect(parseExpenseMessage("almoço 42,50 nubank")).toEqual({
      description: "almoço",
      amountReais: 42.5,
      installments: 1,
      cardHint: "nubank",
      recurring: false,
    });
  });
  it("parcelado + cartão (ordem livre depois do valor)", () => {
    expect(parseExpenseMessage("geladeira 300 nubank 3x")).toEqual({
      description: "geladeira",
      amountReais: 300,
      installments: 3,
      cardHint: "nubank",
      recurring: false,
    });
    expect(parseExpenseMessage("geladeira 1.299,90 3x amazon")).toEqual({
      description: "geladeira",
      amountReais: 1299.9,
      installments: 3,
      cardHint: "amazon",
      recurring: false,
    });
  });
  it("descrição com várias palavras", () => {
    expect(parseExpenseMessage("mercado do mês 512.30")).toEqual({
      description: "mercado do mês",
      amountReais: 512.3,
      installments: 1,
      cardHint: null,
      recurring: false,
    });
  });
  it("inválidos retornam null", () => {
    expect(parseExpenseMessage("sem valor nenhum")).toBeNull();
    expect(parseExpenseMessage("42,50")).toBeNull(); // sem descrição
    expect(parseExpenseMessage("")).toBeNull();
    expect(parseExpenseMessage("almoço 0")).toBeNull(); // valor zero
  });
});

describe("recorrência mensal (palavra-chave)", () => {
  it("'mensal' após o valor marca recorrência (não vira cardHint)", () => {
    expect(parseExpenseMessage("internet 120 mensal")).toEqual({
      description: "internet",
      amountReais: 120,
      installments: 1,
      cardHint: null,
      recurring: true,
    });
  });
  it("'recorrente' também funciona, combinado com outras palavras de cartão", () => {
    expect(parseExpenseMessage("academia 99,90 recorrente")).toEqual({
      description: "academia",
      amountReais: 99.9,
      installments: 1,
      cardHint: null,
      recurring: true,
    });
    // keyword + cartão: recorrente é extraído e o resto vira cardHint
    expect(parseExpenseMessage("spotify 21,90 nubank mensal")).toEqual({
      description: "spotify",
      amountReais: 21.9,
      installments: 1,
      cardHint: "nubank",
      recurring: true,
    });
  });
});

describe("parseExpenseLines", () => {
  it("várias linhas viram várias despesas", () => {
    const { entries, failedLines } = parseExpenseLines(
      "ifood 54,90 nubank\nuber 23,40 nubank\nmercado 312,75",
    );
    expect(failedLines).toEqual([]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      description: "ifood",
      amountReais: 54.9,
      installments: 1,
      cardHint: "nubank",
      recurring: false,
    });
    expect(entries[2].cardHint).toBeNull();
  });
  it("linhas vazias são ignoradas; inválidas vão para failedLines", () => {
    const { entries, failedLines } = parseExpenseLines(
      "ifood 54,90\n\n   \nlinha sem valor\ngeladeira 300 nubank 3x\n",
    );
    expect(entries).toHaveLength(2);
    expect(entries[1].installments).toBe(3);
    expect(failedLines).toEqual(["linha sem valor"]);
  });
  it("mensagem de uma linha só também funciona", () => {
    const { entries, failedLines } = parseExpenseLines("almoço 42,50");
    expect(entries).toHaveLength(1);
    expect(failedLines).toEqual([]);
  });
});
