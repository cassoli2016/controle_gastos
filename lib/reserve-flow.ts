import { monthToDate } from "@/lib/dates";
import { decimalToCents, formatCents } from "@/lib/money";

// ATENÇÃO: este módulo é importado por Client Component (MonthEntryList usa as
// categorias). Nada de prisma aqui — a gravação vive em lib/reserve-deposit.ts,
// senão o client do banco entra no bundle do browser e o build quebra.

/**
 * Movimentos de caixinha viram MonthlyEntry comuns (já pagos) criados na
 * mesma transação que ajusta ReserveBox.amount — assim o dinheiro está OU no
 * mês OU na caixinha, nunca nos dois (spec 2026-07-31-deposito-caixinha).
 */
export const RESERVE_CATEGORY = {
  name: "Reserva",
  type: "EXPENSE",
  color: "#14b8a6",
  isTransfer: true,
} as const;
export const RESERVE_WITHDRAWAL_CATEGORY = {
  name: "Retirada da reserva",
  type: "INCOME",
  color: "#14b8a6",
  isTransfer: true,
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
    description: `${DEPOSIT_PREFIX}${reserveName}`,
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

/** Prefixo das descrições geradas por `depositEntryData`. */
export const DEPOSIT_PREFIX = "Depósito · ";

/**
 * Caixinha a pré-selecionar ao guardar dinheiro: a do depósito mais recente.
 *
 * `descriptions` vem do banco já ordenada da mais recente para a mais antiga.
 * Um depósito de caixinha renomeada ou excluída simplesmente não casa e a
 * busca segue para o anterior — daí a varredura em vez de olhar só o primeiro.
 */
export function lastUsedReserveId(
  descriptions: string[],
  boxes: { id: string; name: string }[],
): string | null {
  for (const d of descriptions) {
    if (!d.startsWith(DEPOSIT_PREFIX)) continue;
    // slice, não split: caixinha pode ter "·" no próprio nome.
    const name = d.slice(DEPOSIT_PREFIX.length);
    const box = boxes.find((b) => b.name === name);
    if (box) return box.id;
  }
  return boxes[0]?.id ?? null;
}

export type ReserveReversal = { withdrawalId: string; boxId: string; amountCents: number };

/**
 * O que devolver à caixinha ao desmarcar a baixa de uma conta paga por ela.
 *
 * `null` quando não há nada a fazer: conta paga do jeito comum, ou retirada
 * cuja caixinha foi excluída depois (não há para onde devolver — o registro da
 * retirada continua lá como histórico).
 *
 * O valor é o da RETIRADA, nunca o da conta: quem editou a baixa depois de
 * pagar tiraria da caixinha um valor que nunca saiu dela.
 */
export function reserveReversal(
  withdrawal: {
    id: string;
    reserveBoxId: string | null;
    plannedAmount: unknown;
    paidAmount: unknown;
  } | null,
): ReserveReversal | null {
  if (!withdrawal || !withdrawal.reserveBoxId) return null;
  const amount = withdrawal.paidAmount ?? withdrawal.plannedAmount;
  return {
    withdrawalId: withdrawal.id,
    boxId: withdrawal.reserveBoxId,
    amountCents: decimalToCents(String(amount)),
  };
}

/**
 * Frase do card "Saldo" sobre o movimento de caixinha do mês.
 *
 * O caso que importa é o mês fechado no vermelho DEPOIS de tirar da reserva:
 * "tirado da caixinha" só conta metade — quem lê quer saber que o buraco do
 * mês foi tapado por ali. Agosto/2026 é o exemplo: saldo de -R$ 7.347,77 com
 * R$ 6.929,84 vindos da caixinha.
 */
export function savedInMonthLabel(balanceCents: number, savedCents: number): string | null {
  if (savedCents === 0) return null;
  if (savedCents > 0) return `${formatCents(savedCents)} guardado na caixinha`;
  const taken = formatCents(-savedCents);
  return balanceCents < 0 ? `${taken} vieram da caixinha` : `${taken} tirado da caixinha`;
}
