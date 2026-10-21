import { describe, it, expect } from "vitest";
import { negativeMonths, freeReserveCents } from "@/lib/planning";
import type { EntryView } from "@/lib/calc";

const v = (p: Partial<EntryView> & Pick<EntryView, "itemName" | "categoryType" | "plannedCents">): EntryView => ({
  categoryId: "c",
  categoryName: "x",
  paid: false,
  paidCents: null,
  ...p,
});

const SALARIO = v({ itemName: "Salário", categoryType: "INCOME", plannedCents: 1_000_000 });
const CONTA_GRANDE = v({ itemName: "Entrada do carro", categoryType: "EXPENSE", plannedCents: 3_500_000, paid: true });
/** Retirada de caixinha: transferência, e INCOME porque o dinheiro entra na conta. */
const RETIRADA = v({ itemName: "Retirada · Reserva", categoryType: "INCOME", plannedCents: 2_000_000, paid: true, isTransfer: true });
/** Depósito: transferência, e EXPENSE porque o dinheiro sai da conta. */
const DEPOSITO = v({ itemName: "Depósito · Reserva", categoryType: "EXPENSE", plannedCents: 500_000, isTransfer: true });

const mapa = (views: EntryView[]) => new Map([["2026-10", views]]);

describe("negativeMonths — o descoberto que as caixinhas precisam cobrir", () => {
  it("mês sem transferência: o descoberto é receitas menos despesas", () => {
    expect(negativeMonths(mapa([SALARIO, CONTA_GRANDE]))).toEqual([
      { month: "2026-10", balanceCents: -2_500_000 },
    ]);
  });

  it("conta paga PELA CAIXINHA encolhe o descoberto no valor da retirada", () => {
    // O bug que motivou este teste: a retirada já tinha saído do total das
    // caixinhas, mas o descoberto seguia contando a despesa inteira — os
    // mesmos R$ 20 mil descontados duas vezes da folga.
    const [outubro] = negativeMonths(mapa([SALARIO, CONTA_GRANDE, RETIRADA]));
    expect(outubro.balanceCents).toBe(-500_000);
  });

  it("a folga não muda ao pagar uma conta prevista com a caixinha", () => {
    const reservas = 7_000_000;
    const semRetirada = reservas + negativeMonths(mapa([SALARIO, CONTA_GRANDE]))[0].balanceCents;
    // Pagou pela caixinha: as reservas caem 20 mil e o descoberto encolhe 20 mil.
    const comRetirada = reservas - 2_000_000 + negativeMonths(mapa([SALARIO, CONTA_GRANDE, RETIRADA]))[0].balanceCents;
    expect(comRetirada).toBe(semRetirada);
  });

  it("depósito na caixinha vira descoberto: o dinheiro saiu da conta", () => {
    const barato = v({ itemName: "Contas", categoryType: "EXPENSE", plannedCents: 800_000 });
    // Sem o depósito o mês fecharia em +2.000,00 e não apareceria aqui.
    expect(negativeMonths(mapa([SALARIO, barato]))).toEqual([]);
    expect(negativeMonths(mapa([SALARIO, barato, DEPOSITO]))).toEqual([
      { month: "2026-10", balanceCents: -300_000 },
    ]);
  });

  it("saldo livre: guardado menos os meses no vermelho", () => {
    // Out/2026: R$ 40.920,03 nas caixinhas e quatro meses no vermelho somando
    // -R$ 13.695,26 → sobram R$ 27.224,77 para segurar os custos.
    const negatives = [
      { month: "2026-11", balanceCents: -894651 },
      { month: "2026-12", balanceCents: -162122 },
      { month: "2027-01", balanceCents: -120531 },
      { month: "2028-10", balanceCents: -192222 },
    ];
    expect(freeReserveCents(4_092_003, negatives)).toBe(2_722_477);
  });

  it("saldo livre sem mês no vermelho é o próprio total guardado", () =>
    expect(freeReserveCents(4_092_003, [])).toBe(4_092_003));

  it("saldo livre fica negativo quando as caixinhas não cobrem os buracos", () =>
    expect(freeReserveCents(100_000, [{ month: "2026-11", balanceCents: -250_000 }])).toBe(-150_000));

  it("mês no azul fica de fora", () => {
    expect(negativeMonths(mapa([SALARIO]))).toEqual([]);
  });

  it("preserva a ordem dos meses recebida", () => {
    const m = new Map([
      ["2026-10", [SALARIO, CONTA_GRANDE]],
      ["2026-11", [SALARIO]],
      ["2026-12", [SALARIO, CONTA_GRANDE]],
    ]);
    expect(negativeMonths(m).map((x) => x.month)).toEqual(["2026-10", "2026-12"]);
  });
});
