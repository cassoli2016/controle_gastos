import { describe, it, expect } from "vitest";
import { groupInstallmentPlans, duplicateSeqs, planName, type PlanLine } from "@/lib/installment-plan";

const l = (monthISO: string, seq: number, cents: number, purchaseDateISO: string | null = null, desc = "AMAZON BR SAO PAULO"): PlanLine =>
  ({ monthISO, seq, count: 5, cents, purchaseDateISO, desc });

describe("groupInstallmentPlans — o que é UM plano de parcelamento", () => {
  it("parcelas consecutivas do mesmo plano ficam juntas", () => {
    const g = groupInstallmentPlans([l("2026-11", 2, 1368), l("2026-12", 3, 1368), l("2027-01", 4, 1368)]);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(3);
  });

  it("duas compras no MESMO estabelecimento, em meses diferentes, são planos diferentes", () => {
    // O falso positivo que motivou isto: a Amazon repete "(04/05)" em compras
    // distintas. Ancorando em mês−parcela, elas se separam sozinhas.
    const g = groupInstallmentPlans([
      l("2026-08", 4, 1010), // comprada em 2026-04
      l("2027-01", 4, 1935), // comprada em 2026-09
    ]);
    expect(g).toHaveLength(2);
  });

  it("mesma âncora mas datas de compra diferentes também separa", () => {
    const g = groupInstallmentPlans([
      l("2026-11", 1, 5000, "2026-10-02"),
      l("2026-11", 1, 7000, "2026-10-08"),
    ]);
    expect(g).toHaveLength(2);
  });

  it("a cauda projetada (sem data de compra) entra no plano pela âncora", () => {
    const g = groupInstallmentPlans([
      l("2026-10", 1, 1368, "2026-09-15"),
      l("2026-11", 2, 1368, null),
      l("2026-12", 3, 1368, null),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(3);
  });

  it("estabelecimentos diferentes nunca se misturam", () => {
    const g = groupInstallmentPlans([l("2026-11", 2, 1368, null, "RENNER"), l("2026-12", 3, 1368, null, "AMAZON")]);
    expect(g).toHaveLength(2);
  });
});

describe("groupInstallmentPlans — compras do MESMO mês", () => {
  const amz = (monthISO: string, seq: number, cents: number, compra: string | null): PlanLine =>
    ({ monthISO, seq, count: 10, cents, purchaseDateISO: compra, desc: "AMAZON MARKETPLACE SAO PAULO" });

  it("mesmo mês e datas de compra diferentes são planos diferentes", () => {
    // Caso real: 7 compras na Amazon na mesma fatura, todas em 10x. A âncora
    // não separa (mesmo mês), a data sim.
    const g = groupInstallmentPlans([
      amz("2026-08", 1, 3272, "2026-07-14"),
      amz("2026-08", 1, 4738, "2026-07-25"),
      amz("2026-08", 1, 5986, "2026-07-10"),
    ]);
    expect(g).toHaveLength(3);
  });

  it("mesmo DIA, valores diferentes: ainda são compras diferentes", () => {
    // 11/07: uma de R$ 50,30 e outra de R$ 282,47.
    const g = groupInstallmentPlans([
      amz("2026-08", 1, 5030, "2026-07-11"),
      amz("2026-08", 1, 28247, "2026-07-11"),
    ]);
    expect(g).toHaveLength(2);
  });

  it("o arredondamento do banco entre parcelas NÃO separa o plano", () => {
    // 59,86 na 1ª e 59,84 na 2ª é a mesma compra.
    const g = groupInstallmentPlans([
      amz("2026-08", 1, 5986, "2026-07-10"),
      amz("2026-09", 2, 5984, "2026-07-10"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toHaveLength(2);
  });

  it("a cauda sem data entra no plano de valor parecido, não em qualquer um", () => {
    const g = groupInstallmentPlans([
      amz("2026-08", 1, 5030, "2026-07-11"),
      amz("2026-08", 1, 28247, "2026-07-11"),
      amz("2026-09", 2, 28241, null), // cauda da compra de 282
    ]);
    const grande = g.find((p) => p.some((l) => l.cents > 20000))!;
    expect(grande).toHaveLength(2);
    expect(g).toHaveLength(2);
  });
});

describe("duplicateSeqs — a mesma parcela cobrada duas vezes", () => {
  it("plano íntegro não acusa nada", () => {
    expect(duplicateSeqs([l("2026-11", 1, 1368), l("2026-12", 2, 1368)])).toEqual([]);
  });

  it("parcela repetida no MESMO mês é duplicata (o caso BYD)", () => {
    const d = duplicateSeqs([l("2026-12", 2, 16667), l("2026-12", 2, 16667)]);
    expect(d).toEqual([{ seq: 2, months: ["2026-12", "2026-12"] }]);
  });

  it("parcela repetida em meses diferentes DENTRO do mesmo plano é duplicata", () => {
    // Reimportação com competência deslocada: mesma âncora não dá, mas se o
    // agrupamento colocou as duas no mesmo plano, duas cobranças da parcela 3
    // continuam sendo erro.
    const d = duplicateSeqs([l("2026-12", 3, 1368), l("2027-01", 3, 1368)]);
    expect(d).toEqual([{ seq: 3, months: ["2026-12", "2027-01"] }]);
  });
});

describe("planName — o nome do plano, sem a posição da parcela", () => {
  it("tira o marcador do Bradesco, grudado no nome", () => {
    // Era isto que quebrava tudo: com "(04/05)" no nome, cada parcela virava
    // um plano só dela, e duas compras diferentes no mesmo mês com a mesma
    // posição viravam "a parcela 4 cobrada duas vezes".
    expect(planName("AMAZON BR SAO PAULO(04/05)")).toBe("AMAZON BR SAO PAULO");
    expect(planName("amazon marketplace sao paulo(01/10)")).toBe("amazon marketplace sao paulo");
  });

  it("tira o marcador escrito, do Nubank", () => {
    expect(planName("Byd Sao Jose - parcela 2/6")).toBe("Byd Sao Jose");
  });

  it("não mexe em nome sem marcador", () => {
    expect(planName("Renner")).toBe("Renner");
  });

  it("não confunde número que faz parte do nome", () => {
    expect(planName("Hana Ograx Senior 5")).toBe("Hana Ograx Senior 5");
    expect(planName("Posto 24/7")).toBe("Posto 24/7");
  });

  it("duas compras do mesmo mês com marcadores diferentes caem no mesmo nome", () => {
    expect(planName("AMAZON BR SAO PAULO(01/05)")).toBe(planName("AMAZON BR SAO PAULO(04/05)"));
  });
});
