import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { resolveDefaultPurchaseCategoryId } from "@/lib/purchases";
import { installmentMonths } from "@/lib/installments";
import { cardTargetMonth } from "@/lib/fatura";
import { consumeSubscriptionCharge } from "@/lib/card-subscription";

export type CardRef = { id: string; name: string; closingDay: number | null };

export { cardTargetMonth } from "@/lib/fatura";

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
): Promise<{ months: string[]; firstMonthTotalCents: number; replacedProvision: boolean }> {
  const months = installmentMonths(startMonth, installments);

  // Cobrança de assinatura chegando de verdade (compra 1x): CONSOME a linha
  // provisionada da assinatura (marca paga e abate o previsto) — o custo
  // passa a viver dentro do consolidado do cartão, sem contar em dobro.
  let subscriptionId: string | null = null;
  let replacedProvision = false;
  if (installments === 1) {
    const consumed = await consumeSubscriptionCharge(card, months[0], meta.description, amountCents, meta.dateISO);
    subscriptionId = consumed.subscriptionId;
    replacedProvision = subscriptionId !== null;
  }

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
      subscriptionId,
    })),
  });
  return { months, firstMonthTotalCents, replacedProvision };
}

/**
 * Pagamento antecipado da fatura: abate o consolidado do mês-alvo (data +
 * fechamento) e registra linha negativa no extrato com prepayment=true —
 * preservada quando o CSV substitui o mês.
 */
export async function addPrepaymentToCard(
  card: CardRef,
  dateISO: string,
  amountCents: number,
): Promise<{ month: string; totalCents: number }> {
  const month = cardTargetMonth(card, dateISO, dateISO.slice(0, 7));
  const { totalCents } = await upsertCardEntry({ card, month, amountCents: -amountCents, mode: "add" });
  await prisma.cardTransaction.create({
    data: {
      cardId: card.id,
      month: monthToDate(month),
      description: "Pagamento antecipado",
      amount: centsToNumber(-amountCents),
      purchaseDate: new Date(dateISO + "T00:00:00Z"),
      prepayment: true,
    },
  });
  return { month, totalCents };
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
  // Antecipações manuais são preservadas: no CSV elas viram "Pagamento
  // recebido" (ignorado), então apagá-las perderia o abatimento.
  await prisma.cardTransaction.deleteMany({
    where: { cardId: card.id, month: monthDate, prepayment: false },
  });
  if (rows.length > 0) {
    // Cobrança de assinatura no CSV: consome a linha provisionada (marca paga)
    // e etiqueta a linha do extrato com a assinatura.
    const data = [];
    for (const r of rows) {
      const { subscriptionId } =
        r.amountCents > 0
          ? await consumeSubscriptionCharge(card, month, r.description, r.amountCents, r.dateISO)
          : { subscriptionId: null };
      data.push({
        cardId: card.id,
        month: monthDate,
        description: r.description,
        amount: centsToNumber(r.amountCents),
        purchaseDate: r.dateISO ? new Date(r.dateISO + "T00:00:00Z") : null,
        subscriptionId,
      });
    }
    await prisma.cardTransaction.createMany({ data });
  }
  const kept = await prisma.cardTransaction.aggregate({
    where: { cardId: card.id, month: monthDate, prepayment: true },
    _sum: { amount: true },
  });
  const keptCents = kept._sum.amount ? decimalToCents(String(kept._sum.amount)) : 0;
  const totalCents = rows.reduce((acc, r) => acc + r.amountCents, 0) + keptCents;
  return upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
}
