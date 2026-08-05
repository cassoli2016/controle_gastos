import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import { sumFaturaLines, buildInstallmentSchedule } from "@/lib/fatura-core";

const text = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");

function parsed() {
  const r = parseNubankFatura(text);
  if ("error" in r) throw new Error(`parse falhou: ${r.error}`);
  return r;
}

describe("parseNubankFatura — cabeçalho e resumo", () => {
  it("lê vencimento, competência e fechamento", () => {
    const f = parsed();
    expect(f.bank).toBe("nubank");
    expect(f.dueDateISO).toBe("2026-08-12");
    expect(f.faturaMonth).toBe("2026-08");
    // Fechamento corrente = próximo fechamento (05 SET) menos 1 mês.
    expect(f.closingISO).toBe("2026-08-05");
  });

  it("lê o Total a pagar sem confundir com o detalhe do parcelamento", () => {
    // O documento tem "Total a pagar: R$ 83,74" no detalhe de uma parcela
    // financiada e "Total a pagar" como rótulo solto na tabela de opções.
    expect(parsed().totalCents).toBe(1788429);
  });

  it("lê o limite da página 1, não a coluna Disponível da página 4", () => {
    expect(parsed().limitCents).toBe(5155000);
  });

  it("expõe os saldos em aberto do banco", () => {
    expect(parsed().upcoming).toEqual({ nextCents: 765756, totalCents: 2096907 });
  });

  it("deriva expectedLinesCents do resumo", () => {
    // compras 18.446,11 + IOF 0,55 − outros 107,12 = 18.339,54
    expect(parsed().expectedLinesCents).toBe(1833954);
  });
});

describe("parseNubankFatura — linhas", () => {
  it("extrai todas as linhas, classificadas", () => {
    const f = parsed();
    expect(f.lines).toHaveLength(230);
    expect(f.lines.filter((l) => l.kind === "purchase")).toHaveLength(222);
    expect(f.lines.filter((l) => l.kind === "refund")).toHaveLength(6);
    expect(f.lines.filter((l) => l.kind === "payment")).toHaveLength(2);
  });

  it("fecha o invariante de transcrição", () => {
    const f = parsed();
    expect(sumFaturaLines(f.lines)).toBe(f.expectedLinesCents);
  });

  it("lê o valor deslocado da compra internacional", () => {
    // "16 JUL •••• 0000 Interserver.Net" / "USD 3.00" / "Conversão: …" / "R$ 15,75"
    const line = parsed().lines.find((l) => l.description === "Interserver.Net");
    expect(line).toBeDefined();
    expect(line!.cents).toBe(1575);
    expect(line!.kind).toBe("purchase");
  });

  it("lê o valor deslocado da parcela financiada", () => {
    // "05 JUL Privalia Br I - Parcela 4/4" + 2 linhas de detalhe + "R$ 20,94"
    const line = parsed().lines.find((l) => l.description === "Privalia Br I - Parcela 4/4");
    expect(line).toBeDefined();
    expect(line!.cents).toBe(2094);
    expect(line!.installment).toEqual({ seq: 4, count: 4 });
  });

  it("reconhece negativo com o sinal U+2212", () => {
    const credito = parsed().lines.find((l) => l.description.startsWith("Crédito de"));
    expect(credito).toBeDefined();
    expect(credito!.cents).toBeLessThan(0);
    expect(credito!.kind).toBe("refund");
  });

  it("classifica pagamento de fatura como payment e confere com o resumo", () => {
    const payments = parsed().lines.filter((l) => l.kind === "payment");
    expect(payments.map((p) => p.cents).sort((a, b) => a - b)).toEqual([-1253560, -45525]);
  });

  it("aceita linha sem cartão mascarado (NuPay/NuTag)", () => {
    const nupay = parsed().lines.filter((l) => l.description.includes("NuPay"));
    expect(nupay.length).toBeGreaterThan(0);
    expect(nupay.every((l) => !l.description.startsWith("••"))).toBe(true);
  });

  it("tira o prefixo do cartão mascarado da descrição", () => {
    expect(parsed().lines.every((l) => !/^•/.test(l.description))).toBe(true);
    expect(parsed().lines.every((l) => !/^\d{4}\s/.test(l.description))).toBe(true);
  });

  it("preserva nome de loja que começa com dígito", () => {
    // O strip do cartão mascarado não pode comer o começo destas descrições.
    const descriptions = parsed().lines.map((l) => l.description);
    expect(descriptions).toContain("230 Liv Ctba - Parcela 3/3");
    expect(descriptions).toContain("00028 Lj Curitiba Xv");
    expect(descriptions).toContain("2m *Cineplus");
  });

  it("ignora subtotal por pessoa, cabeçalho de página e saldo restante", () => {
    const descriptions = parsed().lines.map((l) => l.description);
    expect(descriptions).not.toContain("Titular Exemplo");
    expect(descriptions.some((d) => d.includes("TRANSAÇÕES"))).toBe(false);
    expect(descriptions.some((d) => d.includes("Saldo restante"))).toBe(false);
  });

  it("marca as parcelas", () => {
    expect(parsed().lines.filter((l) => l.installment)).toHaveLength(102);
  });
});

describe("parseNubankFatura — cronograma", () => {
  it("projeta as parcelas futuras agrupadas por plano", () => {
    const f = parsed();
    const schedule = buildInstallmentSchedule(f.lines, f.faturaMonth, "nubank");
    const total = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
    // Projeção por linha daria 2623486 (parcelas antecipadas contadas de novo).
    expect(total).toBe(2002897);
  });

  it("quitação antecipada não deixa parcela futura", () => {
    const f = parsed();
    const schedule = buildInstallmentSchedule(f.lines, f.faturaMonth, "nubank");
    const nescafe = [...schedule.values()].flat().filter((r) => r.description.includes("Nescafe"));
    expect(nescafe).toHaveLength(0);
  });
});

describe("parseNubankFatura — rejeição", () => {
  it("recusa texto que não é fatura Nubank", () => {
    const r = parseNubankFatura("qualquer coisa\nsem âncora nenhuma");
    expect(r).toHaveProperty("error");
  });

  it("recusa quando a identidade do resumo não fecha", () => {
    const quebrado = text.replace("Total a pagar R$ 17.884,29", "Total a pagar R$ 99.999,99");
    const r = parseNubankFatura(quebrado);
    expect(r).toHaveProperty("error");
  });
});
