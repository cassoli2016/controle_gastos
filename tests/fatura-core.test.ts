import { describe, it, expect } from "vitest";
import { sumFaturaLines, buildInstallmentSchedule, type FaturaLine } from "@/lib/fatura-core";

function line(partial: Partial<FaturaLine> & { description: string; cents: number }): FaturaLine {
  return {
    dateISO: "2026-07-05",
    kind: "purchase",
    installment: null,
    ...partial,
  };
}

describe("sumFaturaLines", () => {
  it("soma compras e estornos e ignora pagamento de fatura", () => {
    const lines = [
      line({ description: "Mercado", cents: 10000 }),
      line({ description: "Estorno", cents: -2500, kind: "refund" }),
      line({ description: "Pagamento em 06 JUL", cents: -50000, kind: "payment" }),
    ];
    expect(sumFaturaLines(lines)).toBe(7500);
  });
});

describe("buildInstallmentSchedule", () => {
  it("projeta pp+1..tt a partir da parcela cobrada", () => {
    const lines = [line({ description: "Loja - Parcela 2/4", cents: 5000, installment: { seq: 2, count: 4 } })];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    expect([...schedule.keys()].sort()).toEqual(["2026-09", "2026-10"]);
    expect(schedule.get("2026-09")![0].description).toBe("Loja - Parcela 3/4");
    expect(schedule.get("2026-10")![0].description).toBe("Loja - Parcela 4/4");
  });

  it("agrupa por plano: quitação antecipada não projeta parcela já paga", () => {
    // O Nubank cobra a parcela normal + todas as antecipadas no mesmo ciclo.
    // Projetar por linha recriaria 3..10 a partir da 2, 4..10 a partir da 3, etc.
    const lines: FaturaLine[] = [
      line({ description: "Nescafe - Parcela 2/10", cents: 3380, installment: { seq: 2, count: 10 } }),
    ];
    for (let seq = 3; seq <= 10; seq++) {
      lines.push(
        line({ description: `Antecipada - Nescafe - Parcela ${seq}/10`, cents: 3380, installment: { seq, count: 10 } }),
      );
    }
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    expect(schedule.size).toBe(0);
  });

  it("separa planos da mesma loja por valor da parcela", () => {
    const lines = [
      line({ description: "Franciscana - Parcela 8/12", cents: 1799, installment: { seq: 8, count: 12 } }),
      line({ description: "Franciscana - Parcela 9/9", cents: 3088, installment: { seq: 9, count: 9 } }),
    ];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    // Só o plano de 12x tem futuro (9..12); o de 9x terminou.
    expect([...schedule.keys()].sort()).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(schedule.get("2026-09")!.map((r) => r.cents)).toEqual([1799]);
  });

  it("reescreve o marcador no formato do Bradesco", () => {
    const lines = [
      line({ description: "AMAZON BR SAO PAULO(09/12)", cents: 1594, installment: { seq: 9, count: 12 } }),
    ];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "bradesco");
    expect(schedule.get("2026-09")![0].description).toBe("AMAZON BR SAO PAULO(10/12)");
  });

  it("estorno e pagamento não projetam nada", () => {
    const lines = [
      line({ description: "Estorno - Parcela 1/5", cents: -5000, kind: "refund", installment: { seq: 1, count: 5 } }),
      line({ description: "Pagamento em 06 JUL", cents: -50000, kind: "payment", installment: null }),
    ];
    expect(buildInstallmentSchedule(lines, "2026-08", "bradesco").size).toBe(0);
  });
});
