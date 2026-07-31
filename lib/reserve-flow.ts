import { monthToDate } from "@/lib/dates";

/**
 * Movimentos de caixinha viram MonthlyEntry comuns (já pagos) criados na
 * mesma transação que ajusta ReserveBox.amount — assim o dinheiro está OU no
 * mês OU na caixinha, nunca nos dois (spec 2026-07-31-deposito-caixinha).
 */
export const RESERVE_CATEGORY = { name: "Reserva", type: "EXPENSE", color: "#14b8a6" } as const;
export const RESERVE_WITHDRAWAL_CATEGORY = {
  name: "Retirada da reserva",
  type: "INCOME",
  color: "#14b8a6",
} as const;

export type ReserveEntryData = {
  description: string;
  month: Date;
  purchaseDate: Date;
  /** Reais (convenção dos forms e do Decimal no banco). */
  plannedAmount: number;
  paid: true;
  paidAmount: number;
  paidDate: Date;
};

/** Lançamento de um depósito: competência = mês da data, já pago. */
export function depositEntryData(reserveName: string, amount: number, dateISO: string): ReserveEntryData {
  const date = new Date(dateISO + "T00:00:00Z");
  return {
    description: `Depósito · ${reserveName}`,
    month: monthToDate(dateISO.slice(0, 7)),
    purchaseDate: date,
    plannedAmount: amount,
    paid: true,
    paidAmount: amount,
    paidDate: date,
  };
}

/**
 * Lançamento da retirada ao pagar uma conta pela caixinha: competência = mês
 * da CONTA (o par despesa/retirada se cancela no mesmo mês).
 */
export function withdrawalEntryData(
  reserveName: string,
  amount: number,
  entryMonth: Date,
  paidDateISO: string,
): ReserveEntryData {
  const date = new Date(paidDateISO + "T00:00:00Z");
  return {
    description: `Retirada · ${reserveName}`,
    month: entryMonth,
    purchaseDate: date,
    plannedAmount: amount,
    paid: true,
    paidAmount: amount,
    paidDate: date,
  };
}
