import { describe, it, expect } from "vitest";
import { cardSpend } from "@/lib/card-spend";

const tx = (dateISO: string, reais: number, description: string) => ({ dateISO, cents: Math.round(reais * 100), description });

describe("cardSpend", () => {
  const txs = [
    tx("2026-11-03", 300, "Festval Torres"),
    tx("2026-11-10", 120, "Restaurante Kharina"),
    tx("2026-11-20", 200, "Festval Torres"),
    tx("2026-11-25", 999, "Festval Torres"), // depois de hoje: fora
    tx("2026-08-05", 310, "Festval Torres"),
    tx("2026-09-05", 310, "Festval Torres"),
    tx("2026-10-05", 310, "Abastec*Abastece Ai"),
    tx("2026-07-30", 5000, "Ita Thermas Resort e S"), // antes da janela: fora
  ];
  const r = cardSpend(txs, "2026-11-21");

  it("mês corrente até hoje e ritmo por dia", () => {
    expect(r.month).toBe("2026-11");
    expect(r.daysElapsed).toBe(21);
    expect(r.currentCents).toBe(62000);
    expect(r.currentPerDayCents).toBe(Math.round(62000 / 21));
    expect(r.lastPurchaseISO).toBe("2026-11-20");
  });

  it("média dos três meses anteriores, por mês e por dia (31+30+31 dias)", () => {
    expect(r.previousMonths).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(r.averageCents).toBe(31000);
    expect(r.averagePerDayCents).toBe(Math.round(93000 / 92));
  });

  it("grupos com mês corrente e média, maiores primeiro; grupo vazio some", () => {
    expect(r.groups.map((g) => [g.id, g.currentCents, g.averageCents])).toEqual([
      ["mercado", 50000, 20667],
      ["restaurantes", 12000, 0],
      ["transporte", 0, 10333],
    ]);
    expect(r.groups[0].top).toEqual([{ name: "Festval Torres", cents: 50000 }]);
    // sem compra no mês, os destaques vêm da média
    expect(r.groups[2].top[0].name).toBe("Abastec*Abastece Ai");
  });
});
