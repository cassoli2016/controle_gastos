import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isBradescoExtrato, parseBradescoExtrato, type ParsedExtrato } from "@/lib/bradesco-extrato";
import { sumFaturaLines } from "@/lib/fatura-core";
import { faturaMonth } from "@/lib/fatura";

const TEXT = readFileSync("tests/fixtures/bradesco-extrato.txt", "utf8");
const FATURA_FECHADA = readFileSync("tests/fixtures/bradesco-fatura.txt", "utf8");
const NUBANK = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");

const extrato = parseBradescoExtrato(TEXT) as ParsedExtrato;
const linha = (trecho: string) => extrato.lines.find((l) => l.description.includes(trecho))!;

describe("isBradescoExtrato", () => {
  it("reconhece o extrato em aberto do app Bradesco", () => expect(isBradescoExtrato(TEXT)).toBe(true));
  it("não confunde com a fatura FECHADA do Bradesco", () =>
    expect(isBradescoExtrato(FATURA_FECHADA)).toBe(false));
  it("não confunde com a fatura do Nubank", () => expect(isBradescoExtrato(NUBANK)).toBe(false));
});

describe("parseBradescoExtrato — metadados", () => {
  it("não retorna erro", () => expect("error" in extrato).toBe(false));
  it("data de geração do cabeçalho", () => expect(extrato.generatedISO).toBe("2026-09-13"));
  it("total declarado do extrato", () => expect(extrato.statementTotalCents).toBe(98081));
  it("total do titular é informativo e vem separado", () => expect(extrato.holderTotalCents).toBe(50803));
  it("competência sai da data de geração + ciclo do cartão", () =>
    expect(faturaMonth(extrato.generatedISO, 27, 10)).toBe("2026-10"));
});

describe("parseBradescoExtrato — linhas", () => {
  it("26 compras + 1 pagamento", () => {
    expect(extrato.lines).toHaveLength(27);
    expect(extrato.lines.filter((l) => l.kind === "purchase")).toHaveLength(26);
    expect(extrato.lines.filter((l) => l.kind === "payment")).toHaveLength(1);
  });

  it("soma das compras bate com o total declarado", () =>
    expect(sumFaturaLines(extrato.lines)).toBe(extrato.statementTotalCents));

  it("linha inteira numa só linha do texto", () => {
    const l = extrato.lines[0];
    expect(l.dateISO).toBe("2026-09-08");
    expect(l.description).toBe("AMAZON MARKETPLACE SA");
    expect(l.installment).toEqual({ seq: 1, count: 10 });
    expect(l.cents).toBe(3234);
  });

  it("descrição quebrada com a data na PRIMEIRA linha", () => {
    const l = linha("JAVIANACO");
    expect(l.dateISO).toBe("2026-08-30");
    expect(l.description).toBe("AMAZONMKTPLC*JAVIANACO SA");
    expect(l.installment).toEqual({ seq: 1, count: 10 });
    expect(l.cents).toBe(4398);
  });

  it("descrição quebrada com a data na SEGUNDA linha", () => {
    const l = linha("NOGORACOM");
    expect(l.dateISO).toBe("2026-07-09");
    expect(l.description).toBe("AMAZONMKTPLC*NOGORACOM SA");
    expect(l.installment).toEqual({ seq: 3, count: 10 });
    expect(l.cents).toBe(2163);
  });

  it("pagamento da fatura anterior: sinal ANTES do número e fora da soma", () => {
    const l = extrato.lines.find((x) => x.kind === "payment")!;
    expect(l.dateISO).toBe("2026-09-03");
    expect(l.cents).toBe(-145359);
    expect(l.installment).toBeNull();
  });

  it("mês posterior ao da geração é do ano anterior", () => {
    const l = linha("GAMERPLAC");
    expect(l.dateISO).toBe("2025-12-28");
    expect(l.installment).toEqual({ seq: 9, count: 14 });
    expect(l.cents).toBe(10350);
  });

  it("marcador de 1 dígito por 2 dígitos (8/8) não vira parte do nome", () => {
    const l = extrato.lines.find((x) => x.dateISO === "2026-01-29")!;
    expect(l.description).toBe("AMAZON BR SA");
    expect(l.installment).toEqual({ seq: 8, count: 8 });
  });

  it("nenhuma descrição carrega o marcador de parcela", () =>
    expect(extrato.lines.filter((l) => /\d\/\d/.test(l.description))).toEqual([]));

  it("nenhuma descrição carrega as colunas de câmbio", () =>
    expect(extrato.lines.filter((l) => /R\$|000 0,00/.test(l.description))).toEqual([]));

  it("as linhas de total do rodapé não viram lançamento", () =>
    expect(extrato.lines.filter((l) => /Total/i.test(l.description))).toEqual([]));
});
