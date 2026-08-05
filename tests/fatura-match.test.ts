import { describe, it, expect } from "vitest";
import { canonicalFaturaDescription, readInstallment, matchKey } from "@/lib/fatura-match";

describe("canonicalFaturaDescription", () => {
  it("tira o prefixo Antecipada", () => {
    // Medido na fatura real: 26 das 31 falsas órfãs eram só este prefixo.
    expect(canonicalFaturaDescription("Antecipada - Nescafe Dolce Gusto - Parcela 3/10")).toBe(
      canonicalFaturaDescription("Nescafe Dolce Gusto - Parcela 3/10"),
    );
  });

  it("resolve o apelido do NuTag", () => {
    // App grava "NuTag*BEI2A53", fatura grava "Transação de NuTag".
    expect(canonicalFaturaDescription("NuTag*BEI2A53")).toBe(canonicalFaturaDescription("Transação de NuTag"));
  });

  it("ignora caixa e acento", () => {
    expect(canonicalFaturaDescription("ASSOCIACAO FRANCISCANA")).toBe(
      canonicalFaturaDescription("Associação Franciscana"),
    );
  });

  it("não junta estabelecimentos diferentes", () => {
    expect(canonicalFaturaDescription("Mabu Hotel")).not.toBe(canonicalFaturaDescription("Hotel Brasil"));
  });
});

describe("readInstallment", () => {
  it("lê das colunas (convenção do bot/share)", () => {
    expect(readInstallment({ description: "Beto Carrero World", installmentSeq: 3, installmentCount: 10 })).toEqual({
      seq: 3,
      count: 10,
    });
  });

  it("lê do marcador Nubank na descrição", () => {
    expect(readInstallment({ description: "Mabu Hotel - Parcela 3/6" })).toEqual({ seq: 3, count: 6 });
  });

  it("lê do marcador Bradesco na descrição", () => {
    expect(readInstallment({ description: "AMAZON BR SAO PAULO(09/12)" })).toEqual({ seq: 9, count: 12 });
  });

  it("coluna ganha do marcador quando os dois existem", () => {
    expect(readInstallment({ description: "Loja - Parcela 2/4", installmentSeq: 3, installmentCount: 4 })).toEqual({
      seq: 3,
      count: 4,
    });
  });

  it("compra à vista não tem parcela", () => {
    expect(readInstallment({ description: "Festval Torres" })).toBeNull();
    expect(readInstallment({ description: "Mp *20526951adria" })).toBeNull();
    expect(readInstallment({ description: "230 Liv Ctba" })).toBeNull();
  });
});

describe("matchKey", () => {
  it("mesma chave para as duas grafias do mesmo lançamento", () => {
    expect(matchKey("Antecipada - Associacao Franciscana - Parcela 7/9", 3088)).toBe(
      matchKey("Associação Franciscana - Parcela 7/9", 3088),
    );
  });

  it("valor diferente é chave diferente", () => {
    expect(matchKey("Festval Torres", 1000)).not.toBe(matchKey("Festval Torres", 1001));
  });
});
