import { describe, it, expect } from "vitest";
import {
  depositEntryData,
  withdrawalEntryData,
  RESERVE_CATEGORY,
  RESERVE_WITHDRAWAL_CATEGORY,
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
