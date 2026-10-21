import { describe, it, expect } from "vitest";
import { splitMoney } from "@/lib/money";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("splitMoney", () => {
  it("separa símbolo e dígitos", () => {
    const p = splitMoney(123456);
    expect(p.negative).toBe(false);
    expect(p.symbol).toBe("R$");
    expect(norm(p.digits)).toBe("1.234,56");
  });
  it("negativo vira flag; os dígitos saem sem sinal", () => {
    const p = splitMoney(-162700);
    expect(p.negative).toBe(true);
    expect(norm(p.digits)).toBe("1.627,00");
  });
  it("zero", () => {
    const p = splitMoney(0);
    expect(p.negative).toBe(false);
    expect(norm(p.digits)).toBe("0,00");
  });
});
