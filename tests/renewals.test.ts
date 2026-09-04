import { describe, it, expect } from "vitest";
import { upcomingRenewals, renewalLabel, nextRenewalStartMonth, renewalStartMonthsThrough, splitInstallmentsCents } from "@/lib/renewals";

describe("renewalStartMonthsThrough", () => {
  it("uma ocorrência por ano, da próxima até o horizonte", () => {
    expect(renewalStartMonthsThrough(5, "2026-08", "2028-12")).toEqual(["2027-05", "2028-05"]);
    expect(renewalStartMonthsThrough(9, "2026-08", "2028-12")).toEqual(["2026-09", "2027-09", "2028-09"]);
  });
  it("ocorrência que COMEÇA no mês do horizonte entra (a cauda pode passar)", () => {
    expect(renewalStartMonthsThrough(5, "2026-08", "2027-05")).toEqual(["2027-05"]);
  });
  it("horizonte antes da próxima renovação: nada a provisionar", () => {
    expect(renewalStartMonthsThrough(5, "2026-08", "2027-04")).toEqual([]);
  });
  it("mês corrente é o próprio mês de renovação: começa neste ano", () => {
    expect(renewalStartMonthsThrough(8, "2026-08", "2027-12")).toEqual(["2026-08", "2027-08"]);
  });
});

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
