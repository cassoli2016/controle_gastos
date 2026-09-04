import { describe, it, expect } from "vitest";
import { accumulateBalance, patrimonyProjection } from "@/lib/patrimony";
import type { EntryView } from "@/lib/calc";

describe("accumulateBalance", () => {
  it("acumula partindo do patrimônio atual", () => {
    expect(
      accumulateBalance(100000, [
        { month: "ago.", balanceCents: -20000 },
        { month: "set.", balanceCents: 50000 },
      ]),
    ).toEqual([
      { month: "ago.", totalCents: 80000 },
      { month: "set.", totalCents: 130000 },
    ]);
  });
  it("vazio → vazio", () => expect(accumulateBalance(100, [])).toEqual([]));
});

describe("patrimonyProjection", () => {
  const conta = (type: "INCOME" | "EXPENSE", cents: number): EntryView => ({
    itemName: "Conta", categoryId: "c", categoryName: "Moradia", categoryType: type,
    plannedCents: cents, paid: true, paidCents: cents, isTransfer: false,
  });
  const deposito = (cents: number): EntryView => ({
    itemName: "Depósito · Cristian", categoryId: "cat-reserva", categoryName: "Reserva",
    categoryType: "EXPENSE", plannedCents: cents, paid: true, paidCents: cents, isTransfer: true,
  });

  it("guardar na caixinha NÃO muda o patrimônio — só troca o dinheiro de bolso", () => {
    // Mesmo mês, duas histórias: deixar a sobra na conta ou guardá-la. Quem
    // guardou já viu o total das caixinhas subir, então parte de um patrimônio
    // maior e o mês contribui zero. Os dois caminhos têm de chegar no mesmo
    // lugar — se a projeção usasse o saldo do mês (que ignora transferências),
    // o depósito viraria patrimônio novo e o dinheiro contaria duas vezes.
    const mes = [conta("INCOME", 2500000), conta("EXPENSE", 1300000)];
    const naConta = patrimonyProjection(1000000, [{ month: "set.", views: mes }]);
    const naCaixinha = patrimonyProjection(1000000 + 1200000, [
      { month: "set.", views: [...mes, deposito(1200000)] },
    ]);
    expect(naCaixinha).toEqual(naConta);
    expect(naCaixinha).toEqual([{ month: "set.", totalCents: 2200000 }]);
  });

  it("acumula mês a mês a partir do patrimônio atual", () => {
    expect(
      patrimonyProjection(500000, [
        { month: "set.", views: [conta("INCOME", 300000), conta("EXPENSE", 100000)] },
        { month: "out.", views: [conta("EXPENSE", 50000)] },
      ]),
    ).toEqual([
      { month: "set.", totalCents: 700000 },
      { month: "out.", totalCents: 650000 },
    ]);
  });

  it("mês sem lançamento não move o patrimônio", () =>
    expect(patrimonyProjection(500000, [{ month: "set.", views: [] }])).toEqual([
      { month: "set.", totalCents: 500000 },
    ]));
});
