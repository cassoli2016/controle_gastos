import { describe, it, expect } from "vitest";
import { toCsv, csvMoney, csvDate } from "@/lib/csv-export";

const BOM = "﻿";

describe("toCsv", () => {
  it("cabeçalho e linhas com BOM e CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "2"]])).toBe(`${BOM}A;B\r\n1;2\r\n`);
  });

  it("sem linhas devolve só BOM e cabeçalho", () => {
    expect(toCsv(["A", "B"], [])).toBe(`${BOM}A;B\r\n`);
  });

  it("célula com ponto e vírgula sai entre aspas", () => {
    expect(toCsv(["A"], [["x;y"]])).toBe(`${BOM}A\r\n"x;y"\r\n`);
  });

  it("aspas internas são duplicadas", () => {
    expect(toCsv(["A"], [['diz "oi"']])).toBe(`${BOM}A\r\n"diz ""oi"""\r\n`);
  });

  it("quebra de linha na célula sai entre aspas", () => {
    expect(toCsv(["A"], [["linha1\nlinha2"]])).toBe(`${BOM}A\r\n"linha1\nlinha2"\r\n`);
  });

  it("null e undefined viram vazio; número vira texto", () => {
    expect(toCsv(["A", "B", "C"], [[null, undefined, 42]])).toBe(`${BOM}A;B;C\r\n;;42\r\n`);
  });
});

describe("csvMoney", () => {
  it("centavos viram valor com vírgula decimal, sem separador de milhar", () => {
    expect(csvMoney(123456)).toBe("1234,56");
  });
  it("zero e negativo", () => {
    expect(csvMoney(0)).toBe("0,00");
    expect(csvMoney(-5050)).toBe("-50,50");
  });
});

describe("csvDate", () => {
  it("data UTC vira DD/MM/AAAA", () => {
    expect(csvDate(new Date("2026-08-02T00:00:00Z"))).toBe("02/08/2026");
  });
  it("null vira vazio", () => {
    expect(csvDate(null)).toBe("");
  });
});
