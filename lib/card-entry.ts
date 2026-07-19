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

/**
 * Soma uma compra (à vista ou parcelada) no consolidado do cartão: o valor
 * POR parcela é somado em cada um dos N meses a partir de startMonth.
 */
export async function addPurchaseToCard(
  card: CardRef,
  startMonth: string,
  amountCents: number,
  installments: number,
): Promise<{ months: string[]; firstMonthTotalCents: number }> {
  const months = installmentMonths(startMonth, installments);
  let firstMonthTotalCents = 0;
  for (let i = 0; i < months.length; i++) {
    const { totalCents } = await upsertCardEntry({ card, month: months[i], amountCents, mode: "add" });
    if (i === 0) firstMonthTotalCents = totalCents;
  }
  return { months, firstMonthTotalCents };
}
