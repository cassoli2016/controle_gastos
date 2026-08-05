import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { centsToNumber } from "@/lib/money";

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

/**
 * Grava um depósito: soma na caixinha E cria o lançamento já pago no mês da
 * data, na MESMA transação — o dinheiro está ou no mês ou na caixinha, nunca
 * nos dois.
 *
 * Compartilhado pela tela de Reservas e pelo bot: os dois precisam do par
 * indivisível, e duplicar a transação em dois lugares é como um deles acaba
 * esquecendo metade.
 */
export async function depositToReserveBox(opts: {
  boxId: string;
  amountCents: number;
  dateISO: string;
  categoryId: string;
}): Promise<{ boxName: string; newBalanceCents: number } | { error: string }> {
  const box = await prisma.reserveBox.findUnique({ where: { id: opts.boxId } });
  if (!box) return { error: "Caixinha não encontrada." };
  const amount = centsToNumber(opts.amountCents);

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.reserveBox.update({
      where: { id: opts.boxId },
      data: { amount: { increment: amount } },
    });
    await tx.monthlyEntry.create({
      data: { categoryId: opts.categoryId, ...depositEntryData(box.name, amount, opts.dateISO) },
    });
    return b;
  });
  return { boxName: box.name, newBalanceCents: Math.round(Number(updated.amount) * 100) };
}
