import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { installmentMonths } from "@/lib/installments";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { nextRenewalStartMonth, splitInstallmentsCents } from "@/lib/renewals";
import { descriptionsMatch } from "@/lib/description-match";

/**
 * Garante a provisão da PRÓXIMA renovação parcelada de um item (seguro em
 * 4-5x): cria V÷N nos meses [renovação .. renovação+N-1]. Idempotente —
 * meses que já têm lançamento do item ficam como estão.
 */
export async function ensureRenewalProvision(item: {
  id: string;
  renewalMonth: number | null;
  renewalAmount: unknown;
  renewalInstallments: number | null;
}): Promise<{ created: number; months: string[] }> {
  if (!item.renewalMonth || !item.renewalAmount || !item.renewalInstallments) {
    return { created: 0, months: [] };
  }
  const totalCents = decimalToCents(String(item.renewalAmount));
  if (totalCents <= 0) return { created: 0, months: [] };

  const start = nextRenewalStartMonth(item.renewalMonth, todayISOInSaoPaulo().slice(0, 7));
  const months = installmentMonths(start, item.renewalInstallments);
  const parts = splitInstallmentsCents(totalCents, item.renewalInstallments);

  let created = 0;
  for (let i = 0; i < months.length; i++) {
    const monthDate = monthToDate(months[i]);
    const existing = await prisma.monthlyEntry.findUnique({
      where: { itemId_month: { itemId: item.id, month: monthDate } },
    });
    if (existing) continue;
    await prisma.monthlyEntry.create({
      data: { itemId: item.id, month: monthDate, plannedAmount: centsToNumber(parts[i]) },
    });
    created++;
  }
  return { created, months };
}

/**
 * Parcela REAL da renovação chegou no cartão (ex.: "seguro c3 450 nubank 5x"):
 * consome a linha provisionada do item naquele mês — marca paga com o valor
 * real e abate o previsto (o custo passa a viver na fatura do cartão).
 * Retorna true se consumiu.
 */
export async function consumeRenewalCharge(
  month: string,
  description: string,
  chargeCents: number,
  chargeDateISO?: string,
): Promise<boolean> {
  if (chargeCents <= 0) return false;
  const candidates = await prisma.item.findMany({
    where: { active: true, renewalInstallments: { not: null } },
    select: { id: true, name: true },
  });
  const item = candidates.find((i) => descriptionsMatch(i.name, description));
  if (!item) return false;

  const entry = await prisma.monthlyEntry.findUnique({
    where: { itemId_month: { itemId: item.id, month: monthToDate(month) } },
  });
  if (!entry || entry.paid) return false;

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
  return true;
}
