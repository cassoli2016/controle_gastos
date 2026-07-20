import { describe, it, expect } from "vitest";
import { upcomingRenewals, renewalLabel, nextRenewalStartMonth, splitInstallmentsCents } from "@/lib/renewals";

describe("upcomingRenewals", () => {
  const items = [
    { name: "Seguro Carro", renewalMonth: 11 },
    { name: "Seguro Casa", renewalMonth: 7 },
    { name: "Anuidade CNPJ", renewalMonth: 1 },
  ];
  it("mês corrente e horizonte, ordenado por proximidade", () => {
    // Julho: Seguro Casa renova agora; nov/jan ficam fora do horizonte 3
    expect(upcomingRenewals(items, 7)).toEqual([
      { name: "Seguro Casa", renewalMonth: 7, monthsAway: 0 },
    ]);
  });
  it("virada de ano conta certo (dezembro → janeiro = 1 mês)", () => {
    expect(upcomingRenewals(items, 12)).toEqual([
      { name: "Anuidade CNPJ", renewalMonth: 1, monthsAway: 1 },
    ]);
    expect(upcomingRenewals(items, 10, 2)).toEqual([
      { name: "Seguro Carro", renewalMonth: 11, monthsAway: 1 },
    ]);
  });
  it("horizonte maior inclui mais", () => {
    const r = upcomingRenewals(items, 10, 4);
    expect(r.map((x) => x.name)).toEqual(["Seguro Carro", "Anuidade CNPJ"]);
  });
});

describe("renewalLabel", () => {
  it("rotula por proximidade", () => {
    expect(renewalLabel({ name: "x", renewalMonth: 7, monthsAway: 0 })).toBe("renova ESTE mês");
    expect(renewalLabel({ name: "x", renewalMonth: 8, monthsAway: 1 })).toBe("renova mês que vem");
    expect(renewalLabel({ name: "x", renewalMonth: 11, monthsAway: 2 })).toBe("renova em novembro");
  });
});

describe("nextRenewalStartMonth", () => {
  it("mês ainda não passou: este ano; já passou: ano que vem", () => {
    expect(nextRenewalStartMonth(11, "2026-07")).toBe("2026-11");
    expect(nextRenewalStartMonth(7, "2026-07")).toBe("2026-07"); // o próprio mês conta
    expect(nextRenewalStartMonth(3, "2026-07")).toBe("2027-03");
  });
});

describe("splitInstallmentsCents", () => {
  it("soma exatamente o total (resto na última)", () => {
    expect(splitInstallmentsCents(225000, 5)).toEqual([45000, 45000, 45000, 45000, 45000]);
    expect(splitInstallmentsCents(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(splitInstallmentsCents(100000, 3).reduce((a, b) => a + b)).toBe(100000);
  });
});
