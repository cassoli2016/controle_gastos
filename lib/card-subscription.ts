import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { cardTargetMonth, todayISOInSaoPaulo } from "@/lib/fatura";
import { descriptionsMatch } from "@/lib/description-match";
import { createRecurrence, findActiveItemByName } from "@/lib/recurrence";

export { normalizeDescription, descriptionsMatch } from "@/lib/description-match";

type CardLike = { id: string; name?: string; closingDay: number | null; dueDay: number | null };

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
export function firstChargeFaturaMonth(
  card: { closingDay: number | null; dueDay?: number | null },
  chargeDay: number,
  todayISO: string,
): string {
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
  /** Nome fantasia: vira o nome do Item e é o que aparece na tela. */
  description: string;
  /** Como o estabelecimento sai na fatura; sem isso, casa pelo nome fantasia. */
  bankDescription?: string | null;
  amount: number; // reais/mês
  chargeDay: number;
  months?: number;
}): Promise<{ firstMonth: string; months: number; adopted?: boolean } | { error: string }> {
  const dupSub = (
    await prisma.cardSubscription.findMany({ where: { cardId: opts.card.id, active: true } })
  ).find((s) => descriptionsMatch(s.description, opts.description));
  if (dupSub) return { error: `Assinatura "${dupSub.description}" já existe neste cartão — cancele antes de recriar.` };
  const months = opts.months ?? SUBSCRIPTION_MONTHS;
  const categoryId = await resolveSubscriptionCategoryId();
  const firstMonth = firstChargeFaturaMonth(opts.card, opts.chargeDay, todayISOInSaoPaulo());

  // Conta fixa que já existe como Item: ADOTA em vez de recusar.
  //
  // Recusar era um beco sem saída para o caso mais comum — a assinatura cobrada
  // no cartão que a pessoa já lançava como conta fixa. O item é justamente o que
  // a assinatura criaria, e sem o vínculo `consumeSubscriptionCharge` nunca roda:
  // a linha do mês e a cobrança dentro da fatura contam as duas.
  //
  // Adotar preserva as linhas já provisionadas (e o histórico pago); só falta o
  // vínculo para o consumo passar a acontecer.
  const existing = await findActiveItemByName(opts.description);
  if (existing) {
    const alreadyLinked = await prisma.cardSubscription.findUnique({ where: { itemId: existing.id } });
    if (alreadyLinked) {
      return { error: `"${existing.name}" já é assinatura do cartão ${alreadyLinked.cardId === opts.card.id ? "atual" : "outro"}.` };
    }
    await prisma.cardSubscription.create({
      data: {
        cardId: opts.card.id,
        itemId: existing.id,
        description: opts.description,
        bankDescription: opts.bankDescription?.trim() || null,
        amount: opts.amount,
        chargeDay: opts.chargeDay,
        months,
      },
    });
    return { firstMonth, months, adopted: true };
  }

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
      bankDescription: opts.bankDescription?.trim() || null,
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
    // Sem histórico (nenhum lançamento restante): exclui o item — senão a
    // tela de Itens acumula cascas de assinaturas canceladas.
    const remaining = await prisma.monthlyEntry.count({ where: { itemId: sub.itemId } });
    if (remaining === 0) {
      await prisma.item.delete({ where: { id: sub.itemId } }); // sub.itemId → SetNull
    } else {
      await prisma.item.update({ where: { id: sub.itemId }, data: { active: false } });
    }
  }
  await prisma.cardSubscription.update({ where: { id: subscriptionId }, data: { active: false } });
  return { removed };
}

/**
 * Cobrança real chegou na fatura (CSV/share): CONSOME a linha provisionada do
 * mês — marca como paga (valor real) e abate o previsto, já que o custo passa
 * a viver dentro do consolidado do cartão. Sem isso o mês contaria em dobro.
 */
export type SubscriptionCandidate = {
  id: string;
  itemId: string | null;
  description: string;
  /** Como aparece na fatura; quando null, casa pelo próprio `description`. */
  bankDescription: string | null;
};

/**
 * Assinaturas ativas do cartão. Existe separada do consumo para quem importa
 * uma fatura inteira carregar UMA vez em vez de por linha: com 228 linhas, a
 * consulta dentro do laço custava 228 idas ao Postgres remoto para devolver
 * sempre a mesma lista.
 */
export async function loadSubscriptionCandidates(cardId: string): Promise<SubscriptionCandidate[]> {
  return prisma.cardSubscription.findMany({
    where: { cardId, active: true },
    select: { id: true, itemId: true, description: true, bankDescription: true },
  });
}

export async function consumeSubscriptionCharge(
  card: { id: string },
  month: string,
  description: string,
  chargeCents: number,
  chargeDateISO?: string,
): Promise<{ subscriptionId: string | null }> {
  if (chargeCents <= 0) return { subscriptionId: null };
  const subs = await loadSubscriptionCandidates(card.id);
  return consumeSubscriptionChargeWith(subs, month, description, chargeCents, chargeDateISO);
}

/** Como `consumeSubscriptionCharge`, com as candidatas já carregadas. */
export async function consumeSubscriptionChargeWith(
  subs: SubscriptionCandidate[],
  month: string,
  description: string,
  chargeCents: number,
  chargeDateISO?: string,
): Promise<{ subscriptionId: string | null }> {
  if (chargeCents <= 0) return { subscriptionId: null };
  // Casa pelo texto do BANCO quando informado: "YouTube Premium" não está
  // contido em "Google Youtubepremium", então o nome fantasia não serve de chave.
  const match = subs.find((s) => descriptionsMatch(s.bankDescription ?? s.description, description));
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
