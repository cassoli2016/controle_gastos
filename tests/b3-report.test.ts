import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseB3Report, normalizeTicker } from "@/lib/b3-report";

function sheetBuffer(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("normalizeTicker", () => {
  it("aceita ticker e remove sufixo F (fracionário)", () => {
    expect(normalizeTicker("BBSE3")).toBe("BBSE3");
    expect(normalizeTicker("bbse3f")).toBe("BBSE3");
    expect(normalizeTicker("KLBN11")).toBe("KLBN11");
    expect(normalizeTicker("TOTAL")).toBeNull();
  });
});

describe("parseB3Report — Negociação", () => {
  it("extrai compras e vendas", () => {
    const buf = sheetBuffer([
      ["Data do Negócio", "Tipo de Movimentação", "Mercado", "Prazo/Vencimento", "Instituição", "Código de Negociação", "Quantidade", "Preço", "Valor"],
      ["21/07/2026", "Compra", "Mercado à Vista", "", "NU INVEST", "BBSE3", 100, 41.27, 4127],
      ["22/07/2026", "Venda", "Mercado à Vista", "", "NU INVEST", "VULC3F", 30, 14.5, 435],
      ["", "", "", "", "", "", "", "", ""],
    ]);
    const r = parseB3Report(buf);
    expect(r.kind).toBe("negociacao");
    expect(r.trades).toEqual([
      { dateISO: "2026-07-21", ticker: "BBSE3", side: "BUY", quantity: 100, price: 41.27, value: 4127 },
      { dateISO: "2026-07-22", ticker: "VULC3", side: "SELL", quantity: 30, price: 14.5, value: 435 },
    ]);
    expect(r.incomes).toEqual([]);
  });
});

describe("parseB3Report — Movimentação", () => {
  it("extrai só proventos creditados; negócios/débitos são pulados", () => {
    const buf = sheetBuffer([
      ["Entrada/Saída", "Data", "Movimentação", "Produto", "Instituição", "Quantidade", "Preço unitário", "Valor da Operação"],
      ["Credito", "18/07/2026", "Dividendo", "BBSE3 - BB SEGURIDADE PARTICIPACOES S.A.", "NU", 1900, 0.5, 950],
      ["Credito", "19/07/2026", "Juros Sobre Capital Próprio", "CMIG4 - CIA ENERGETICA DE MG", "NU", 100, 0.11, 9.35],
      ["Credito", "20/07/2026", "Rendimento", "MXRF11 - MAXI RENDA FII", "NU", 50, 0.1, 5],
      ["Credito", "21/07/2026", "Transferência - Liquidação", "BBSE3 - BB SEGURIDADE", "NU", 100, 41.27, 4127],
      ["Debito", "22/07/2026", "Dividendo", "BBSE3 - BB SEGURIDADE", "NU", 10, 0.5, 5],
    ]);
    const r = parseB3Report(buf);
    expect(r.kind).toBe("movimentacao");
    expect(r.trades).toEqual([]);
    expect(r.incomes).toEqual([
      { dateISO: "2026-07-18", ticker: "BBSE3", type: "Dividendos", quantity: 1900, unitValue: 0.5, value: 950 },
      { dateISO: "2026-07-19", ticker: "CMIG4", type: "JSCP", quantity: 100, unitValue: 0.11, value: 9.35 },
      { dateISO: "2026-07-20", ticker: "MXRF11", type: "Rendimento", quantity: 50, unitValue: 0.1, value: 5 },
    ]);
    expect(r.skipped).toBe(2);
  });
});

describe("parseB3Report — desconhecido", () => {
  it("planilha sem cabeçalhos da B3", () => {
    const buf = sheetBuffer([["a", "b"], [1, 2]]);
    expect(parseB3Report(buf).kind).toBe("unknown");
  });
});
