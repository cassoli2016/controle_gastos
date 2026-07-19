import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { cardTargetMonth, todayISOInSaoPaulo } from "@/lib/fatura";
import { descriptionsMatch } from "@/lib/description-match";
import { createRecurrence } from "@/lib/recurrence";

export { normalizeDescription, descriptionsMatch } from "@/lib/description-match";

type CardLike = { id: string; name?: string; closingDay: number | null };

/** Horizonte padrão da provisão (o usuário pode escolher outro por assinatura). */
export const SUBSCRIPTION_MONTHS = 12;

/** Categoria padrão das assinaturas (find-or-create; prefere a existente). */
async function resolveSubscriptionCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: "Assinaturas" } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: "Assinaturas", type: "EXPENSE", color: "#8b5cf6" },
  });
  return created.id;
}

/** Primeira fatura em que a próxima cobrança da assinatura cai. */
export function firstChargeFaturaMonth(card: { closingDay: number | null }, chargeDay: number, todayISO: string): string {
  const [y, m, d] = todayISO.split("-").map(Number);
  // Próxima cobrança: neste mês se o dia ainda não passou, senão no seguinte.
  const chargeMonth = d <= chargeDay ? { y, m } : m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const chargeISO = `${chargeMonth.y}-${String(chargeMonth.m).padStart(2, "0")}-${String(Math.min(chargeDay, 28)).padStart(2, "0")}`;
  return cardTargetMonth(card, chargeISO, chargeISO.slice(0, 7));
}

/**
 * Assinatura = LINHA PRÓPRIA no mês (Item recorrente, categoria Assinaturas),
 * FORA do consolidado do cartão, com duração escolhida. O vínculo com o
 * cartão serve para o consumo quando a cobrança real chega na fatura.
 */
export async function createCardSubscription(opts: {
  card: CardLike;
  description: string;
  amount: number; // reais/mês
  chargeDay: number;
  months?: number;
}): Promise<{ firstMonth: string; months: number }> {
  const months = opts.months ?? SUBSCRIPTION_MONTHS;
  const categoryId = await resolveSubscriptionCategoryId();
  const firstMonth = firstChargeFaturaMonth(opts.card, opts.chargeDay, todayISOInSaoPaulo());
  const { itemId } = await createRecurrence({
    name: opts.description,
    amount: opts.amount,
    startMonth: firstMonth,
    categoryId,
    dueDay: opts.chargeDay,
    months,
  });
  await prisma.cardSubscription.create({
    data: {
      cardId: opts.card.id,
      itemId,
      description: opts.description,
      amount: opts.amount,
      chargeDay: opts.chargeDay,
      months,
    },
  });
  return { firstMonth, months };
}

/**
 * Cancela a assinatura: exclui as linhas provisionadas NÃO pagas de fromMonth
 * em diante e desativa item + cadastro. Meses consumidos ficam como histórico.
 */
export async function cancelCardSubscription(subscriptionId: string, fromMonth: string): Promise<{ removed: number }> {
  const sub = await prisma.cardSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return { removed: 0 };
  let removed = 0;
  if (sub.itemId) {
    const { count } = await prisma.monthlyEntry.deleteMany({
      where: { itemId: sub.itemId, month: { gte: monthToDate(fromMonth) }, paid: false },
    });
    removed = count;
    await prisma.item.update({ where: { id: sub.itemId }, data: { active: false } });
  }
  await prisma.cardSubscription.update({ where: { id: subscriptionId }, data: { active: false } });
  return { removed };
}

/**
 * Cobrança real chegou na fatura (CSV/share): CONSOME a linha provisionada do
 * mês — marca como paga (valor real) e abate o previsto, já que o custo passa
 * a viver dentro do consolidado do cartão. Sem isso o mês contaria em dobro.
 */
export async function consumeSubscriptionCharge(
  card: { id: string },
  month: string,
  description: string,
  chargeCents: number,
  chargeDateISO?: string,
): Promise<{ subscriptionId: string | null }> {
  if (chargeCents <= 0) return { subscriptionId: null };
  const subs = await prisma.cardSubscription.findMany({ where: { cardId: card.id, active: true } });
  const match = subs.find((s) => descriptionsMatch(s.description, description));
  if (!match?.itemId) return { subscriptionId: match?.id ?? null };

  const entry = await prisma.monthlyEntry.findUnique({
    where: { itemId_month: { itemId: match.itemId, month: monthToDate(month) } },
  });
  if (entry && !entry.paid) {
    const remaining = Math.max(0, decimalToCents(String(entry.plannedAmount)) - chargeCents);
    await prisma.monthlyEntry.update({
      where: { id: entry.id },
      data: {
        plannedAmount: centsToNumber(remaining),
        paid: true,
        paidAmount: centsToNumber(chargeCents),
        paidDate: chargeDateISO ? new Date(chargeDateISO + "T00:00:00Z") : new Date(),
      },
    });
  }
  return { subscriptionId: match.id };
}
