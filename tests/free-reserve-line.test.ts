import { describe, it, expect } from "vitest";
import { freeReserveLine } from "@/lib/daily-digest";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("freeReserveLine", () => {
  it("com meses no vermelho", () => {
    expect(norm(freeReserveLine(4_092_003, [{ month: "2026-11", balanceCents: -857_411 }, { month: "2026-12", balanceCents: -162_122 }]))).toBe(
      "🧭 Saldo livre R$ 30.724,70 · guardado R$ 40.920,03 menos 2 meses no vermelho (R$ 10.195,33)",
    );
  });
  it("sem vermelho", () => {
    expect(norm(freeReserveLine(1_000, []))).toBe("🧭 Saldo livre R$ 10,00 · nenhum mês no vermelho à frente");
  });
  it("um mês concorda", () => {
    expect(norm(freeReserveLine(1_000, [{ month: "2026-11", balanceCents: -100 }]))).toContain("1 mês no vermelho");
  });
});
