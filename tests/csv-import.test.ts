import { describe, it, expect } from "vitest";
import { parseCardCsv } from "@/lib/csv-import";

describe("parseCardCsv", () => {
  it("formato Nubank (date,title,amount) com decimais de ponto e data ISO", () => {
    const csv = "date,title,amount\n2026-07-04,Ifood,54.9\n2026-07-05,Uber,23.4\n2026-07-06,Pagamento recebido,-1200.00\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([
      { description: "Ifood", amountReais: 54.9, date: "2026-07-04" },
      { description: "Uber", amountReais: 23.4, date: "2026-07-05" },
    ]);
    expect(result.ignored).toBe(1); // "Pagamento recebido" (fatura anterior)
    expect(result.failed).toBe(0);
  });

  it("só a linha exata 'Pagamento recebido' é ignorada; outros negativos com 'pagamento' entram", () => {
    const csv =
      "date,title,amount\n2026-07-06,Pagamento recebido,-1200.00\n2026-07-06,PAGAMENTO RECEBIDO,-50.00\n2026-07-08,Estorno de pagamento,-30.00\n2026-07-09,Pagamento de boleto Loja,45.00\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([
      { description: "Estorno de pagamento", amountReais: -30, date: "2026-07-08" },
      { description: "Pagamento de boleto Loja", amountReais: 45, date: "2026-07-09" },
    ]);
    expect(result.ignored).toBe(2); // as duas variantes de caixa do "Pagamento recebido"
  });

  it("estorno (negativo que NÃO é pagamento) entra e abate o total", () => {
    const csv =
      "date,title,amount\n2026-07-04,Ifood,54.9\n2026-07-08,Estorno Ifood,-54.9\n2026-07-06,Pagamento recebido,-1200.00\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([
      { description: "Ifood", amountReais: 54.9, date: "2026-07-04" },
      { description: "Estorno Ifood", amountReais: -54.9, date: "2026-07-08" },
    ]);
    expect(result.ignored).toBe(1); // só o pagamento
  });

  it("data em formato BR (DD/MM/YYYY) é normalizada para ISO", () => {
    const csv = "data;descrição;valor\n19/07/2026;Mercado;312,75\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([{ description: "Mercado", amountReais: 312.75, date: "2026-07-19" }]);
  });

  it("sem coluna de data, rows saem sem date", () => {
    const csv = "Mercado;312,75\n";
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([{ description: "Mercado", amountReais: 312.75 }]);
  });

  it("título com vírgula entre aspas", () => {
    const csv = 'date,title,amount\n2026-07-04,"Mercado Livre, SP",312.75\n';
    const result = parseCardCsv(csv);
    expect(result.rows).toEqual([{ description: "Mercado Livre, SP", amountReais: 312.75, date: "2026-07-04" }]);
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
