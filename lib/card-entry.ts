import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { resolveDefaultPurchaseCategoryId } from "@/lib/purchases";
import { installmentMonths } from "@/lib/installments";
import { faturaMonth, todayISOInSaoPaulo } from "@/lib/fatura";

export type CardRef = { id: string; name: string; closingDay: number | null };

/**
 * Mês-alvo de uma compra no cartão: com dia de fechamento cadastrado, a
 * fatura correta pela data da compra (hoje, se não informada); sem
 * fechamento, o mês padrão (primeiro em aberto).
 */
export function cardTargetMonth(card: CardRef, dateISO: string | undefined, defaultMonth: string): string {
  if (card.closingDay == null) return defaultMonth;
  return faturaMonth(dateISO ?? todayISOInSaoPaulo(), card.closingDay) ?? defaultMonth;
}

/**
 * Garante o lançamento CONSOLIDADO do cartão no mês — 1 por cartão/mês,
 * identificado por cardId + mês + description = nome do cartão — e soma
 * ("add") ou define ("set") o valor previsto. Retorna o total atualizado.
 */
export async function upsertCardEntry(opts: {
  card: CardRef;
  month: string; // YYYY-MM
  amountCents: number;
  mode: "add" | "set";
}): Promise<{ totalCents: number }> {
  const monthDate = monthToDate(opts.month);
  const existing = await prisma.monthlyEntry.findFirst({
    where: { cardId: opts.card.id, month: monthDate, description: opts.card.name },
  });
  if (!existing) {
    const categoryId = await resolveDefaultPurchaseCategoryId();
    await prisma.monthlyEntry.create({
      data: {
        description: opts.card.name,
        cardId: opts.card.id,
        categoryId,
        month: monthDate,
        plannedAmount: centsToNumber(opts.amountCents),
      },
    });
    return { totalCents: opts.amountCents };
  }
  const totalCents =
    opts.mode === "add" ? decimalToCents(String(existing.plannedAmount)) + opts.amountCents : opts.amountCents;
  await prisma.monthlyEntry.update({
    where: { id: existing.id },
    data: { plannedAmount: centsToNumber(totalCents) },
  });
  return { totalCents };
}

export type PurchaseMeta = {
  description: string;
  /** Data da compra (YYYY-MM-DD) — vai para o extrato. */
  dateISO?: string;
};

/**
 * Soma uma compra (à vista ou parcelada) no consolidado do cartão E registra
 * o extrato: o valor POR parcela é somado em cada um dos N meses a partir de
 * startMonth, com 1 CardTransaction por mês (seq/count).
 */
export async function addPurchaseToCard(
  card: CardRef,
  startMonth: string,
  amountCents: number,
  installments: number,
  meta: PurchaseMeta,
): Promise<{ months: string[]; firstMonthTotalCents: number }> {
  const months = installmentMonths(startMonth, installments);
  let firstMonthTotalCents = 0;
  for (let i = 0; i < months.length; i++) {
    const { totalCents } = await upsertCardEntry({ card, month: months[i], amountCents, mode: "add" });
    if (i === 0) firstMonthTotalCents = totalCents;
  }
  await prisma.cardTransaction.createMany({
    data: months.map((month, i) => ({
      cardId: card.id,
      month: monthToDate(month),
      description: meta.description,
      amount: centsToNumber(amountCents),
      purchaseDate: meta.dateISO ? new Date(meta.dateISO + "T00:00:00Z") : null,
      installmentSeq: installments > 1 ? i + 1 : null,
      installmentCount: installments > 1 ? installments : null,
    })),
  });
  return { months, firstMonthTotalCents };
}

export type CardMonthRow = {
  description: string;
  /** Negativo = estorno. */
  amountCents: number;
  dateISO?: string;
};

/**
 * Substitui a fatura de um mês (importação de CSV): apaga o extrato do mês,
 * grava as linhas novas e DEFINE o total consolidado — reimportar o mesmo
 * arquivo atualiza em vez de duplicar.
 */
export async function replaceCardMonth(card: CardRef, month: string, rows: CardMonthRow[]): Promise<{ totalCents: number }> {
  const monthDate = monthToDate(month);
  await prisma.cardTransaction.deleteMany({ where: { cardId: card.id, month: monthDate } });
  if (rows.length > 0) {
    await prisma.cardTransaction.createMany({
      data: rows.map((r) => ({
        cardId: card.id,
        month: monthDate,
        description: r.description,
        amount: centsToNumber(r.amountCents),
        purchaseDate: r.dateISO ? new Date(r.dateISO + "T00:00:00Z") : null,
      })),
    });
  }
  const totalCents = rows.reduce((acc, r) => acc + r.amountCents, 0);
  return upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
}
