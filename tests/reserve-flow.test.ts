import { describe, it, expect } from "vitest";
import { formatCents } from "@/lib/money";
import {
  depositEntryData,
  withdrawalEntryData,
  RESERVE_CATEGORY,
  RESERVE_WITHDRAWAL_CATEGORY,
  lastUsedReserveId,
  reserveReversal,
  savedInMonthLabel,
} from "@/lib/reserve-flow";

describe("depositEntryData", () => {
  it("competência = mês da data; lançamento já pago com o mesmo valor", () => {
    expect(depositEntryData("Emergência", 1500.5, "2026-07-31")).toEqual({
      description: "Depósito · Emergência",
      month: new Date(Date.UTC(2026, 6, 1)),
      purchaseDate: new Date("2026-07-31T00:00:00Z"),
      plannedAmount: 1500.5,
      paid: true,
      paidAmount: 1500.5,
      paidDate: new Date("2026-07-31T00:00:00Z"),
    });
  });
  it("virada de ano deriva a competência certa", () => {
    expect(depositEntryData("Emergência", 10, "2026-12-31").month).toEqual(new Date(Date.UTC(2026, 11, 1)));
    expect(depositEntryData("Emergência", 10, "2027-01-01").month).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });
});

describe("withdrawalEntryData", () => {
  it("competência = mês da CONTA paga, não o mês da data do pagamento", () => {
    const julho = new Date(Date.UTC(2026, 6, 1));
    expect(withdrawalEntryData("Emergência", 500, julho, "2026-08-02")).toEqual({
      description: "Retirada · Emergência",
      month: julho,
      purchaseDate: new Date("2026-08-02T00:00:00Z"),
      plannedAmount: 500,
      paid: true,
      paidAmount: 500,
      paidDate: new Date("2026-08-02T00:00:00Z"),
    });
  });
});

describe("categorias dos movimentos", () => {
  it("nomes e tipos distintos, mesma cor", () => {
    expect(RESERVE_CATEGORY).toEqual({
      name: "Reserva",
      type: "EXPENSE",
      color: "#14b8a6",
      isTransfer: true,
    });
    expect(RESERVE_WITHDRAWAL_CATEGORY).toEqual({
      name: "Retirada da reserva",
      type: "INCOME",
      color: "#14b8a6",
      isTransfer: true,
    });
  });
});

describe("categorias de caixinha são transferências", () => {
  // O flag é o que mantém depósito e retirada fora de Receitas/Despesas/Saldo
  // (lib/calc.ts). Categoria nova nasce com ele por causa daqui; as que já
  // existiam foram marcadas pela migration category_is_transfer.
  it("depósito é transferência", () => expect(RESERVE_CATEGORY.isTransfer).toBe(true));
  it("retirada é transferência", () => expect(RESERVE_WITHDRAWAL_CATEGORY.isTransfer).toBe(true));
});

describe("lastUsedReserveId", () => {
  const boxes = [
    { id: "b1", name: "Cristian Cassoli" },
    { id: "b2", name: "Turbo NuCel" },
    { id: "b3", name: "Turbo Ultravioleta" },
  ];

  it("escolhe a caixinha do depósito mais recente", () => {
    // As descrições chegam já ordenadas do banco, da mais recente para a mais
    // antiga (paidDate desc).
    expect(lastUsedReserveId(["Depósito · Turbo NuCel", "Depósito · Cristian Cassoli"], boxes)).toBe("b2");
  });

  it("sem depósito nenhum, fica com a primeira da lista", () =>
    expect(lastUsedReserveId([], boxes)).toBe("b1"));

  it("caixinha que foi renomeada ou excluída não trava a escolha", () =>
    expect(lastUsedReserveId(["Depósito · Viagem", "Depósito · Turbo NuCel"], boxes)).toBe("b2"));

  it("caixinha com '·' no próprio nome continua casando", () =>
    expect(
      lastUsedReserveId(["Depósito · Casa · Reforma"], [{ id: "b9", name: "Casa · Reforma" }]),
    ).toBe("b9"));

  it("sem caixinha nenhuma devolve null", () =>
    expect(lastUsedReserveId(["Depósito · Turbo NuCel"], [])).toBe(null));
});

describe("reserveReversal", () => {
  const retirada = (over: Partial<Parameters<typeof reserveReversal>[0] & object> = {}) => ({
    id: "w1",
    reserveBoxId: "b1",
    plannedAmount: "1453.59",
    paidAmount: "1453.59",
    ...over,
  });

  it("devolve o valor da retirada para a caixinha dela", () =>
    expect(reserveReversal(retirada())).toEqual({
      withdrawalId: "w1",
      boxId: "b1",
      amountCents: 145359,
    }));

  it("conta que não foi paga pela caixinha não devolve nada", () =>
    expect(reserveReversal(null)).toBe(null));

  it("caixinha excluída depois do pagamento: não há para onde devolver", () =>
    expect(reserveReversal(retirada({ reserveBoxId: null }))).toBe(null));

  it("usa o valor da RETIRADA, não o da conta — quem editou a baixa depois não tira dinheiro a mais", () =>
    expect(reserveReversal(retirada({ paidAmount: "1000.00" }))?.amountCents).toBe(100000));

  it("retirada sem valor de baixa cai no previsto", () =>
    expect(reserveReversal(retirada({ paidAmount: null }))?.amountCents).toBe(145359));
});

describe("savedInMonthLabel", () => {
  it("mês no vermelho com retirada líquida: diz que a caixinha cobriu", () =>
    // Agosto/2026: entrou R$ 50.895,43, saiu R$ 58.243,20, e a diferença veio
    // da reserva. Dizer só "tirado da caixinha" não liga uma coisa à outra.
    expect(savedInMonthLabel(-734777, -692984)).toBe(`${formatCents(692984)} vieram da caixinha`));

  it("mês no azul com retirada líquida: só informa a retirada", () =>
    expect(savedInMonthLabel(500000, -100000)).toBe(`${formatCents(100000)} tirado da caixinha`));

  it("guardou no mês: diz quanto foi guardado", () =>
    expect(savedInMonthLabel(-364678, 1444505)).toBe(`${formatCents(1444505)} guardado na caixinha`));

  it("sem movimento de caixinha: nada a dizer", () =>
    expect(savedInMonthLabel(-100000, 0)).toBe(null));
});
