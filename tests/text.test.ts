import { describe, it, expect } from "vitest";
import { stripDiacritics, normalizeText } from "@/lib/text";

describe("stripDiacritics", () => {
  it("remove acentos preservando a caixa", () => {
    expect(stripDiacritics("Água")).toBe("Agua");
    expect(stripDiacritics("SÃO JOÃO")).toBe("SAO JOAO");
    expect(stripDiacritics("dezembro")).toBe("dezembro");
  });
});

describe("normalizeText", () => {
  it("minúsculas e sem acentos", () => {
    expect(normalizeText("Crédito")).toBe("credito");
    expect(normalizeText("ALUGUEL")).toBe("aluguel");
    expect(normalizeText("São João")).toBe("sao joao");
  });
});
