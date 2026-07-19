import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { installmentMonths } from "@/lib/installments";
import { upsertCardEntry, cardTargetMonth, type CardRef } from "@/lib/card-entry";
import { todayISOInSaoPaulo } from "@/lib/fatura";

/** Horizonte de provisionamento de uma assinatura (meses de fatura). */
export const SUBSCRIPTION_MONTHS = 12;

export { normalizeDescription, descriptionsMatch } from "@/lib/description-match";

/** Primeira fatura em que a próxima cobrança da assinatura cai. */
export function firstChargeFaturaMonth(card: CardRef, chargeDay: number, todayISO: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  // Próxima cobrança: neste mês se o dia ainda não passou, senão no seguinte.
  const chargeMonth = d <= chargeDay ? { y, m } : m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const chargeISO = `${chargeMonth.y}-${String(chargeMonth.m).padStart(2, "0")}-${String(Math.min(chargeDay, 28)).padStart(2, "0")}`;
  return cardTargetMonth(card, chargeISO, chargeISO.slice(0, 7));
}

/**
 * Garante a provisão da assinatura em cada mês de [fromMonth, fromMonth+N):
 * cria a linha de extrato (subscriptionId) e soma no consolidado apenas nos
 * meses em que ela ainda não existe — idempotente.
 */
export async function ensureSubscriptionProvision(
  card: CardRef,
  subscription: { id: string; description: string; amount: unknown },
  fromMonth: string,
  monthsAhead: number = SUBSCRIPTION_MONTHS,
): Promise<{ provisioned: string[] }> {
  const months = installmentMonths(fromMonth, monthsAhead);
  const existing = await prisma.cardTransaction.findMany({
    where: { subscriptionId: subscription.id, month: { in: months.map(monthToDate) } },
    select: { month: true },
  });
  const covered = new Set(existing.map((t) => monthStringFromDate(t.month)));
  const missing = months.filter((m) => !covered.has(m));
  const amountCents = decimalToCents(String(subscription.amount));

  for (const month of missing) {
    await upsertCardEntry({ card, month, amountCents, mode: "add" });
    await prisma.cardTransaction.create({
      data: {
        cardId: card.id,
        subscriptionId: subscription.id,
        month: monthToDate(month),
        description: subscription.description,
        amount: centsToNumber(amountCents),
      },
    });
  }
  return { provisioned: missing };
}

/** Cria a assinatura e provisiona as próximas faturas a partir da cobrança seguinte. */
export async function createCardSubscription(opts: {
  card: CardRef;
  description: string;
  amount: number; // reais
  chargeDay: number;
}): Promise<{ id: string; firstMonth: string; provisioned: number }> {
  const sub = await prisma.cardSubscription.create({
    data: {
      cardId: opts.card.id,
      description: opts.description,
      amount: opts.amount,
      chargeDay: opts.chargeDay,
    },
  });
  const firstMonth = firstChargeFaturaMonth(opts.card, opts.chargeDay, todayISOInSaoPaulo());
  const { provisioned } = await ensureSubscriptionProvision(opts.card, sub, firstMonth);
  return { id: sub.id, firstMonth, provisioned: provisioned.length };
}

/**
 * Cancela a assinatura: remove as provisões de meses >= fromMonth (subtraindo
 * do consolidado) e desativa o cadastro. Cobranças reais já importadas ficam.
 */
export async function cancelCardSubscription(subscriptionId: string, fromMonth: string): Promise<{ removed: number }> {
  const sub = await prisma.cardSubscription.findUnique({
    where: { id: subscriptionId },
    include: { card: true },
  });
  if (!sub) return { removed: 0 };
  const card: CardRef = { id: sub.card.id, name: sub.card.name, closingDay: sub.card.closingDay };

  const rows = await prisma.cardTransaction.findMany({
    where: { subscriptionId, month: { gte: monthToDate(fromMonth) } },
  });
  for (const row of rows) {
    const month = monthStringFromDate(row.month);
    await upsertCardEntry({ card, month, amountCents: -decimalToCents(String(row.amount)), mode: "add" });
  }
  await prisma.cardTransaction.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await prisma.cardSubscription.update({ where: { id: subscriptionId }, data: { active: false } });
  return { removed: rows.length };
}
