import { describe, it, expect } from "vitest";
import { parseCardCsv } from "@/lib/csv-import";

describe("parseCardCsv", () => {
  it("formato Nubank (date,title,amount) com decimais de ponto", () => {
    const csv = "date,title,amount\n2026-07-04,Ifood,54.9\n2026-07-05,Uber,23.4\n2026-07-06,Pagamento recebido,-1200.00\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([
      { description: "Ifood", amountReais: 54.9 },
      { description: "Uber", amountReais: 23.4 },
    ]);
    expect(result.ignored).toBe(1); // pagamento (negativo)
    expect(result.failed).toBe(0);
  });

  it("título com vírgula entre aspas", () => {
    const csv = 'date,title,amount\n2026-07-04,"Mercado Livre, SP",312.75\n';
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([{ description: "Mercado Livre, SP", amountReais: 312.75 }]);
  });

  it("formato genérico descrição;valor com decimais pt-BR e cabeçalho", () => {
    const csv = "descrição;valor\nMercado;312,75\nFarmácia;1.089,90\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([
      { description: "Mercado", amountReais: 312.75 },
      { description: "Farmácia", amountReais: 1089.9 },
    ]);
  });

  it("formato genérico sem cabeçalho", () => {
    const csv = "Mercado;312,75\nUber;23,40\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ description: "Mercado", amountReais: 312.75 });
  });

  it("linhas ininteligíveis contam como failed; BOM é ignorado", () => {
    const csv = "\uFEFFdate,title,amount\n2026-07-04,Ifood,54.9\n2026-07-05,SemValor,abc\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.failed).toBe(1);
  });

  it("conteúdo vazio retorna zero linhas", () => {
    expect(parseCardCsv("")).toEqual({ rows: [], ignored: 0, failed: 0 });
    expect(parseCardCsv("\n\n")).toEqual({ rows: [], ignored: 0, failed: 0 });
  });
});
