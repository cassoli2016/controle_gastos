import { describe, it, expect } from "vitest";
import { rowsToInsert } from "@/lib/csv-import";

const linha = (description: string, amountCents: number, dateISO?: string) => ({
  description,
  amountCents,
  dateISO,
});

describe("rowsToInsert", () => {
  it("mês vazio: entra tudo", () =>
    expect(rowsToInsert([linha("Padaria", 1200), linha("Posto", 20000)], [])).toHaveLength(2));

  it("reimportar o mesmo arquivo não duplica nada", () => {
    const csv = [linha("Padaria", 1200), linha("Posto", 20000)];
    expect(rowsToInsert(csv, csv)).toEqual([]);
  });

  it("duas compras IGUAIS no mesmo dia entram as duas", () => {
    // O bug que fazia sumir dinheiro: dois cafés de R$ 12 no mesmo lugar e no
    // mesmo dia são duas compras, não uma repetida.
    const csv = [linha("Cafeteria", 1200, "2026-09-05"), linha("Cafeteria", 1200, "2026-09-05")];
    expect(rowsToInsert(csv, [])).toHaveLength(2);
  });

  it("reimportando, entra só o que faltava da multiplicidade", () => {
    // O banco já tem uma das duas; a segunda ainda precisa entrar.
    const csv = [linha("Cafeteria", 1200, "2026-09-05"), linha("Cafeteria", 1200, "2026-09-05")];
    const existentes = [linha("Cafeteria", 1200, "2026-09-05")];
    expect(rowsToInsert(csv, existentes)).toHaveLength(1);
  });

  it("banco com mais cópias que o arquivo não insere nada", () => {
    const csv = [linha("Cafeteria", 1200, "2026-09-05")];
    const existentes = [linha("Cafeteria", 1200, "2026-09-05"), linha("Cafeteria", 1200, "2026-09-05")];
    expect(rowsToInsert(csv, existentes)).toEqual([]);
  });

  it("mesma descrição e valor em DIAS diferentes são compras distintas", () => {
    const csv = [linha("Padaria", 1200, "2026-09-05"), linha("Padaria", 1200, "2026-09-06")];
    expect(rowsToInsert(csv, [linha("Padaria", 1200, "2026-09-05")])).toEqual([
      linha("Padaria", 1200, "2026-09-06"),
    ]);
  });

  it("linha sem data casa com linha sem data", () =>
    expect(rowsToInsert([linha("Sem data", 500)], [linha("Sem data", 500)])).toEqual([]));

  it("valores diferentes no mesmo dia são compras distintas", () =>
    expect(rowsToInsert([linha("Posto", 15000, "2026-09-05")], [linha("Posto", 20000, "2026-09-05")])).toHaveLength(1));
});
