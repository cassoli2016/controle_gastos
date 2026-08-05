import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectFaturaBank, parseFatura, scheduleWarnings } from "@/lib/fatura-parse";

const nubank = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");
const bradesco = readFileSync("tests/fixtures/bradesco-fatura.txt", "utf8");

describe("detectFaturaBank", () => {
  it("reconhece o Nubank", () => {
    expect(detectFaturaBank(nubank)).toBe("nubank");
  });

  it("reconhece o Bradesco", () => {
    expect(detectFaturaBank(bradesco)).toBe("bradesco");
  });

  it("devolve null para texto desconhecido", () => {
    expect(detectFaturaBank("boleto de água\nvencimento amanhã")).toBeNull();
  });
});

describe("parseFatura", () => {
  it("despacha a fatura do Nubank", () => {
    const f = parseFatura(nubank);
    expect(f).not.toHaveProperty("error");
    if ("error" in f) return;
    expect(f.bank).toBe("nubank");
    expect(f.totalCents).toBe(1788429);
    expect(f.expectedLinesCents).toBe(1833954);
  });

  it("despacha a fatura do Bradesco e mantém expectedLinesCents = totalCents", () => {
    const f = parseFatura(bradesco);
    expect(f).not.toHaveProperty("error");
    if ("error" in f) return;
    expect(f.bank).toBe("bradesco");
    expect(f.expectedLinesCents).toBe(f.totalCents);
  });

  it("erra com mensagem útil quando não reconhece o banco", () => {
    const f = parseFatura("documento qualquer");
    expect(f).toHaveProperty("error");
    if (!("error" in f)) return;
    expect(f.error).toMatch(/Nubank|Bradesco/);
  });
});

describe("scheduleWarnings", () => {
  it("aponta a divergência de centavos no Bradesco", () => {
    const f = parseFatura(bradesco);
    if ("error" in f) throw new Error(f.error);
    expect(scheduleWarnings(f).length).toBeGreaterThan(0);
  });

  it("não compara o cronograma do Nubank", () => {
    // "Saldo em aberto da próxima fatura" do Nubank já inclui compras do ciclo
    // NOVO, que a fatura fechada não lista — comparar daria aviso falso sempre.
    const f = parseFatura(nubank);
    if ("error" in f) throw new Error(f.error);
    expect(f.upcoming).not.toBeNull();
    expect(scheduleWarnings(f)).toEqual([]);
  });
});
