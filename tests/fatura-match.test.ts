import { describe, it, expect } from "vitest";
import {
  canonicalFaturaDescription,
  readInstallment,
  matchKey,
  findOrphans,
  toAppRow,
  type AppRow,
} from "@/lib/fatura-match";
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

  it("tira o meio de pagamento NuPay do nome", () => {
    // A seção de compras da fatura escreve "Ri Happy - NuPay"; a de
    // financiamentos escreve o mesmo estabelecimento sem o NuPay.
    expect(canonicalFaturaDescription("Drogarias Pacheco - NuPay")).toBe(
      canonicalFaturaDescription("Drogarias Pacheco"),
    );
  });

  it("unifica o marcador cru com o marcador escrito", () => {
    // Financiamento vem "Privalia Br I - Parcela 4/4" na fatura e
    // "Privalia Br I - NuPay - 4/4" no app.
    expect(canonicalFaturaDescription("Privalia Br I - NuPay - 4/4")).toBe(
      canonicalFaturaDescription("Privalia Br I - Parcela 4/4"),
    );
  });

  it("preserva o sufixo de parcela ao aplicar apelido", () => {
    // Sem isso o apelido engoliria o marcador e a parcela 1 casaria com a 3.
    expect(canonicalFaturaDescription("Mercado Livre - Parcela 1/4")).not.toBe(
      canonicalFaturaDescription("Mercado Livre - Parcela 3/4"),
    );
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

  it("lê o marcador cru do financiamento", () => {
    // A seção "Pagamentos e Financiamentos" gera linha "… - 4/4", sem "Parcela".
    expect(readInstallment({ description: "Privalia Br I - NuPay - 4/4" })).toEqual({ seq: 4, count: 4 });
  });

  it("compra à vista não tem parcela", () => {
    expect(readInstallment({ description: "Festval Torres" })).toBeNull();
    expect(readInstallment({ description: "Mp *20526951adria" })).toBeNull();
    expect(readInstallment({ description: "230 Liv Ctba" })).toBeNull();
  });

  it("não confunde código no fim da descrição com marcador cru", () => {
    expect(readInstallment({ description: "Dafiti*4605843990" })).toBeNull();
    expect(readInstallment({ description: "Bradesco Aut*03de04" })).toBeNull();
    // Parcela nunca é maior que o total.
    expect(readInstallment({ description: "Loja - 9/4" })).toBeNull();
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

describe("toAppRow", () => {
  it("usa o texto do banco quando existe, não o apelido do usuário", () => {
    // Você renomeou a linha para algo legível; o casamento tem que continuar
    // olhando o nome do banco, senão a fatura seguinte duplica a cauda.
    const row = toAppRow({
      id: "1",
      description: "Parcelas Amazon (apelido teste)",
      bankDescription: "AMAZON RETAIL CPI SAO PAULO(09/12)",
      amount: "15.94",
      installmentSeq: null,
      installmentCount: null,
    });
    expect(row.description).toBe("AMAZON RETAIL CPI SAO PAULO(09/12)");
    // E a parcela sai do marcador do texto do BANCO, não do apelido.
    expect(row.installment).toEqual({ seq: 9, count: 12 });
  });

  it("cai na descrição visível quando não há texto do banco", () => {
    const row = toAppRow({
      id: "1",
      description: "Es Estacionamento",
      bankDescription: null,
      amount: "230.00",
      installmentSeq: null,
      installmentCount: null,
    });
    expect(row.description).toBe("Es Estacionamento");
    expect(row.cents).toBe(23000);
  });

  it("coluna de parcela ganha do marcador, mesmo com texto do banco", () => {
    const row = toAppRow({
      id: "1",
      description: "Beto Carrero World",
      bankDescription: "Beto Carrero*Beto Carr - Parcela 1/10",
      amount: "63.47",
      installmentSeq: 3,
      installmentCount: 10,
    });
    expect(row.installment).toEqual({ seq: 3, count: 10 });
  });
});

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

describe("findOrphans — estorno casa por valor", () => {
  it("estorno manual casa com o crédito da fatura mesmo com nome diferente", () => {
    // Digitado no bot: "estorno 56,71 shopee". A fatura escreve outra coisa.
    const rows = [app("1", "Estorno shopee", -5671)];
    const lines = [inv('Crédito de "Shopee *Conceptartdeco"', -5671)];
    expect(findOrphans(rows, lines)).toEqual([]);
  });

  it("IOF de volta idem", () => {
    const rows = [app("1", "IOF de volta", -468)];
    const lines = [inv("IOF de volta de Paddle.Net* Dr.Buho", -468)];
    expect(findOrphans(rows, lines)).toEqual([]);
  });

  it("valor diferente NÃO casa — segue órfã", () => {
    const rows = [app("1", "Estorno shopee", -5671)];
    const lines = [inv('Crédito de "Shopee *X"', -5600)];
    expect(findOrphans(rows, lines)).toHaveLength(1);
  });

  it("o pareamento por valor consome o crédito: dois estornos iguais precisam de dois créditos", () => {
    const rows = [app("1", "Estorno a", -1000), app("2", "Estorno b", -1000)];
    const lines = [inv('Crédito de "Loja"', -1000)];
    expect(findOrphans(rows, lines).map((o) => o.id)).toEqual(["2"]);
  });

  it("POSITIVOS nunca casam só por valor", () => {
    // Duas compras de 50,00 em lojas diferentes são compras diferentes.
    const rows = [app("1", "Padaria", 5000)];
    const lines = [inv("Farmácia", 5000)];
    expect(findOrphans(rows, lines)).toHaveLength(1);
  });

  it("casamento exato por descrição tem prioridade sobre o por valor", () => {
    const rows = [app("1", 'Crédito de "Loja A"', -1000), app("2", "Estorno qualquer", -1000)];
    const lines = [inv('Crédito de "Loja A"', -1000), inv('Crédito de "Loja B"', -1000)];
    // A linha 1 casa com a Loja A pelo nome; a 2 sobra para a Loja B pelo valor.
    expect(findOrphans(rows, lines)).toEqual([]);
  });
});
