import { describe, it, expect } from "vitest";
import { canonicalFaturaDescription, readInstallment, matchKey, findOrphans, type AppRow } from "@/lib/fatura-match";
import type { FaturaLine } from "@/lib/fatura-core";

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

function app(id: string, description: string, cents: number, seq?: number, count?: number): AppRow {
  return { id, description, cents, installment: seq && count ? { seq, count } : null };
}
function inv(description: string, cents: number, seq?: number, count?: number): FaturaLine {
  return {
    dateISO: "2026-07-05",
    description,
    cents,
    kind: cents < 0 ? "refund" : "purchase",
    installment: seq && count ? { seq, count } : null,
  };
}

describe("findOrphans", () => {
  it("linha com par na fatura não é órfã", () => {
    expect(findOrphans([app("1", "Festval Torres", 23908)], [inv("Festval Torres", 23908)])).toEqual([]);
  });

  it("linha sem par é órfã", () => {
    const orphans = findOrphans([app("1", "Es Estacionamento", 23000)], [inv("Festval Torres", 23908)]);
    expect(orphans.map((o) => o.id)).toEqual(["1"]);
  });

  it("casa apesar do prefixo Antecipada", () => {
    const rows = [app("1", "Nescafe Dolce Gusto - Parcela 3/10", 3380, 3, 10)];
    const lines = [inv("Antecipada - Nescafe Dolce Gusto - Parcela 3/10", 3380, 3, 10)];
    expect(findOrphans(rows, lines)).toEqual([]);
  });

  it("casa apesar do apelido do NuTag", () => {
    expect(findOrphans([app("1", "NuTag*BEI2A53", 2000)], [inv("Transação de NuTag", 2000)])).toEqual([]);
  });

  it("consome cada par uma vez: duas iguais no app x uma na fatura deixa uma órfã", () => {
    const rows = [app("1", "Aki Pao", 3054), app("2", "Aki Pao", 3054)];
    expect(findOrphans(rows, [inv("Aki Pao", 3054)]).map((o) => o.id)).toEqual(["2"]);
  });

  it("duas iguais nos dois lados não deixam órfã", () => {
    const rows = [app("1", "Aki Pao", 3054), app("2", "Aki Pao", 3054)];
    expect(findOrphans(rows, [inv("Aki Pao", 3054), inv("Aki Pao", 3054)])).toEqual([]);
  });

  it("pagamento de fatura não conta como par disponível", () => {
    const rows = [app("1", "Pagamento em 06 JUL", -1253560)];
    const lines: FaturaLine[] = [
      {
        dateISO: "2026-07-06",
        description: "Pagamento em 06 JUL",
        cents: -1253560,
        kind: "payment",
        installment: null,
      },
    ];
    // A linha de pagamento não é importada, então nada no app deveria casar com ela.
    expect(findOrphans(rows, lines).map((o) => o.id)).toEqual(["1"]);
  });
});
