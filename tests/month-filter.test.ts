import { describe, it, expect } from "vitest";
import { normalizeText, filterViews } from "@/lib/month-filter";

describe("normalizeText", () => {
  it("minúsculas e sem acentos", () => {
    expect(normalizeText("Crédito")).toBe("credito");
    expect(normalizeText("ALUGUEL")).toBe("aluguel");
    expect(normalizeText("São João")).toBe("sao joao");
  });
});

describe("filterViews", () => {
  const rows = [{ itemName: "ALUGUEL" }, { itemName: "Cartão de Crédito" }, { itemName: "Água" }];

  it("query vazia ou só espaços retorna tudo", () => {
    expect(filterViews(rows, "")).toEqual(rows);
    expect(filterViews(rows, "   ")).toEqual(rows);
  });

  it("casa parcial ignorando maiúsculas", () => {
    expect(filterViews(rows, "alug")).toEqual([rows[0]]);
  });

  it("casa ignorando acentos nos dois lados", () => {
    expect(filterViews(rows, "credito")).toEqual([rows[1]]);
    expect(filterViews(rows, "ÁGUA")).toEqual([rows[2]]);
  });

  it("sem match retorna vazio", () => {
    expect(filterViews(rows, "xyz")).toEqual([]);
  });
});
