import { describe, it, expect } from "vitest";
import { buildMatrix, shortMonthLabel } from "@/lib/matrix";

describe("buildMatrix", () => {
  const entries = [
    { line: "Gobrax", categoryName: "Recebimentos", categoryType: "INCOME" as const, monthISO: "2026-08", cents: 2500000, paid: false },
    { line: "Nubank", categoryName: "Cartão/Compras", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 1400000, paid: false },
    { line: "Nubank", categoryName: "Cartão/Compras", categoryType: "EXPENSE" as const, monthISO: "2026-09", cents: 660000, paid: false },
    // Diarista: duas ocorrências no mesmo mês somam na célula
    { line: "Diarista", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 22000, paid: true },
    { line: "Diarista", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 22000, paid: false },
  ];
  const m = buildMatrix(entries);

  it("meses ordenados e seções INCOME primeiro", () => {
    expect(m.months).toEqual(["2026-08", "2026-09"]);
    expect(m.sections[0].categoryName).toBe("Recebimentos");
    expect(m.sections.map((s) => s.categoryName)).toEqual(["Recebimentos", "Cartão/Compras", "Moradia"]);
  });

  it("células agregam ocorrências (soma + allPaid + count)", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toEqual({ cents: 44000, allPaid: false, count: 2 });
    expect(diarista.totalCents).toBe(44000);
  });

  it("totais por mês (receita, despesa, saldo)", () => {
    expect(m.incomeByMonth["2026-08"]).toBe(2500000);
    expect(m.expenseByMonth["2026-08"]).toBe(1444000);
    expect(m.balanceByMonth["2026-08"]).toBe(1056000);
    expect(m.balanceByMonth["2026-09"]).toBe(-660000);
  });

  it("subtotais da seção por mês", () => {
    const cartao = m.sections.find((s) => s.categoryName === "Cartão/Compras")!;
    expect(cartao.totalsByMonth).toEqual({ "2026-08": 1400000, "2026-09": 660000 });
  });
});

describe("shortMonthLabel", () => {
  it("formata compacto", () => {
    expect(shortMonthLabel("2026-08")).toBe("ago/26");
    expect(shortMonthLabel("2027-01")).toBe("jan/27");
  });
});
