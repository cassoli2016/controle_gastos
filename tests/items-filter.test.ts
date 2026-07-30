import { describe, it, expect } from "vitest";
import { filterItems, parseItemStatus } from "@/lib/items-filter";

const ITEMS = [
  { name: "Internet", active: true },
  { name: "Internet", active: false },
  { name: "Plano de Saúde", active: true },
  { name: "Água", active: true },
];

describe("parseItemStatus", () => {
  it("default ativos", () => expect(parseItemStatus(undefined)).toBe("ativos"));
  it("aceita arquivados/todos", () => {
    expect(parseItemStatus("arquivados")).toBe("arquivados");
    expect(parseItemStatus("todos")).toBe("todos");
  });
  it("lixo → ativos", () => expect(parseItemStatus("x")).toBe("ativos"));
});

describe("filterItems", () => {
  it("status ativos esconde arquivados", () =>
    expect(filterItems(ITEMS, undefined, "ativos")).toHaveLength(3));
  it("status arquivados só arquivados", () =>
    expect(filterItems(ITEMS, undefined, "arquivados")).toEqual([{ name: "Internet", active: false }]));
  it("busca sem caixa/acentos", () =>
    expect(filterItems(ITEMS, "agua", "todos")).toEqual([{ name: "Água", active: true }]));
  it("busca + status combinam", () =>
    expect(filterItems(ITEMS, "internet", "ativos")).toEqual([{ name: "Internet", active: true }]));
});
