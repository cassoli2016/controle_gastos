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
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("descrição + valor + cartão", () => {
    expect(parseExpenseMessage("almoço 42,50 nubank")).toEqual({
      description: "almoço",
      amountReais: 42.5,
      installments: 1,
      cardHint: "nubank",
      recurring: false,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("parcelado + cartão (ordem livre depois do valor)", () => {
    expect(parseExpenseMessage("geladeira 300 nubank 3x")).toEqual({
      description: "geladeira",
      amountReais: 300,
      installments: 3,
      cardHint: "nubank",
      recurring: false,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
    expect(parseExpenseMessage("geladeira 1.299,90 3x amazon")).toEqual({
      description: "geladeira",
      amountReais: 1299.9,
      installments: 3,
      cardHint: "amazon",
      recurring: false,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("descrição com várias palavras", () => {
    expect(parseExpenseMessage("mercado do mês 512.30")).toEqual({
      description: "mercado do mês",
      amountReais: 512.3,
      installments: 1,
      cardHint: null,
      recurring: false,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
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
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("'recorrente' também funciona, combinado com outras palavras de cartão", () => {
    expect(parseExpenseMessage("academia 99,90 recorrente")).toEqual({
      description: "academia",
      amountReais: 99.9,
      installments: 1,
      cardHint: null,
      recurring: true,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
    // keyword + cartão: recorrente é extraído e o resto vira cardHint
    expect(parseExpenseMessage("spotify 21,90 nubank mensal")).toEqual({
      description: "spotify",
      amountReais: 21.9,
      installments: 1,
      cardHint: "nubank",
      recurring: true,
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
});

describe("recebimentos", () => {
  it("prefixo 'recebi' marca income e sai da descrição", () => {
    expect(parseExpenseMessage("recebi freela 500")).toEqual({
      description: "freela",
      amountReais: 500,
      installments: 1,
      cardHint: null,
      recurring: false,
      income: true,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("sufixo 'receita'/'recebimento' também marca income", () => {
    expect(parseExpenseMessage("aluguel kitnet 800 receita")).toEqual({
      description: "aluguel kitnet",
      amountReais: 800,
      installments: 1,
      cardHint: null,
      recurring: false,
      income: true,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
    expect(parseExpenseMessage("dividendos 320,55 recebimento")).toMatchObject({ income: true });
  });
  it("recebimento recorrente (salário)", () => {
    expect(parseExpenseMessage("recebi gobrax 25000 mensal")).toEqual({
      description: "gobrax",
      amountReais: 25000,
      installments: 1,
      cardHint: null,
      recurring: true,
      income: true,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
});

describe("pagamento antecipado", () => {
  it("'antecipei 500 nubank' dispensa descrição", () => {
    expect(parseExpenseMessage("antecipei 500 nubank")).toEqual({
      description: "Pagamento antecipado",
      amountReais: 500,
      installments: 1,
      cardHint: "nubank",
      recurring: false,
      income: false,
      prepayment: true,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("variações do prefixo e sem cartão", () => {
    expect(parseExpenseMessage("antecipado 1.000,00")).toMatchObject({
      prepayment: true,
      amountReais: 1000,
      cardHint: null,
    });
    expect(parseExpenseMessage("antecipação fatura 250 itau")).toMatchObject({
      prepayment: true,
      description: "fatura",
      cardHint: "itau",
    });
  });
});

describe("recorrência semanal (dias da semana)", () => {
  it("'diarista 150 ter sex' vira recorrência semanal", () => {
    expect(parseExpenseMessage("diarista 150 ter sex")).toEqual({
      description: "diarista",
      amountReais: 150,
      installments: 1,
      cardHint: null,
      recurring: false,
      income: false,
      prepayment: false,
      weekdays: [2, 5],
      businessDay: null,
      intervalMonths: null,
    });
  });
  it("nomes por extenso e 6x como duração", () => {
    expect(parseExpenseMessage("diarista 150 terça sexta 6x")).toMatchObject({
      weekdays: [2, 5],
      installments: 6,
    });
    expect(parseExpenseMessage("faxina 200 segunda")).toMatchObject({ weekdays: [1] });
  });
});

describe("quinto dia útil", () => {
  it("'recebi gobrax 25000 mensal 5du'", () => {
    expect(parseExpenseMessage("recebi gobrax 25000 mensal 5du")).toMatchObject({
      income: true,
      recurring: true,
      businessDay: 5,
      cardHint: null,
    });
  });
  it("frase 'quinto dia util' também funciona", () => {
    expect(parseExpenseMessage("recebi salario 25000 mensal quinto dia util")).toMatchObject({
      income: true,
      recurring: true,
      businessDay: 5,
      cardHint: null,
    });
  });
});

describe("recorrência com frequência (a cada N meses)", () => {
  it("'trimestral' marca recorrente com intervalo 3", () => {
    expect(parseExpenseMessage("iptu 320 trimestral")).toMatchObject({
      recurring: true,
      intervalMonths: 3,
      cardHint: null,
    });
  });
  it("bimestral/semestral/anual", () => {
    expect(parseExpenseMessage("taxa 100 bimestral")).toMatchObject({ recurring: true, intervalMonths: 2 });
    expect(parseExpenseMessage("seguro 900 semestral")).toMatchObject({ recurring: true, intervalMonths: 6 });
    expect(parseExpenseMessage("anuidade 550 anual")).toMatchObject({ recurring: true, intervalMonths: 12 });
  });
  it("frase 'a cada 2 meses' também funciona (e sai do cardHint)", () => {
    expect(parseExpenseMessage("jardineiro 180 a cada 2 meses")).toMatchObject({
      recurring: true,
      intervalMonths: 2,
      cardHint: null,
    });
    expect(parseExpenseMessage("dentista 250 cada 3 meses")).toMatchObject({
      recurring: true,
      intervalMonths: 3,
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
      income: false,
      prepayment: false,
      weekdays: null,
      businessDay: null,
      intervalMonths: null,
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
