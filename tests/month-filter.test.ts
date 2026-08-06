import { describe, it, expect } from "vitest";
import { filterViews } from "@/lib/month-filter";

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

import { parseHidePaid, visibleRows } from "@/lib/month-filter";

describe("parseHidePaid", () => {
  it("só '0' esconde", () => {
    expect(parseHidePaid("0")).toBe(true);
    expect(parseHidePaid("1")).toBe(false);
    expect(parseHidePaid(undefined)).toBe(false);
    expect(parseHidePaid("")).toBe(false);
  });
});

describe("visibleRows", () => {
  const rows = [
    { itemName: "Luz", paid: false },
    { itemName: "Água", paid: true },
    { itemName: "Reserva do dia a dia", paid: false, readOnlyHint: "calculado" },
  ];

  it("desligado, mostra tudo", () => {
    expect(visibleRows(rows, false)).toHaveLength(3);
  });

  it("ligado, esconde só as pagas", () => {
    expect(visibleRows(rows, true).map((r) => r.itemName)).toEqual(["Luz", "Reserva do dia a dia"]);
  });

  it("linha derivada nunca some, mesmo marcada como paga", () => {
    const derived = [{ itemName: "Reserva do dia a dia", paid: true, readOnlyHint: "calculado" }];
    expect(visibleRows(derived, true)).toHaveLength(1);
  });

  it("categoria toda paga fica vazia na exibição", () => {
    expect(visibleRows([{ itemName: "Água", paid: true }], true)).toEqual([]);
  });
});
