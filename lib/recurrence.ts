import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";
import { resolveDefaultPurchaseCategoryId } from "@/lib/purchases";

/** Horizonte padrão de provisionamento de uma recorrência (mês inicial incluso). */
export const RECURRENCE_MONTHS = 12;

/**
 * Recorrência mensal = conta fixa: cria um Item (nome/categoria/dia) e
 * provisiona o valor nos próximos meses. Meses seguintes ao horizonte entram
 * pelo "Copiar mês anterior" (com reajuste anual, se configurado no Item).
 */
export async function createRecurrence(opts: {
  name: string;
  /** Valor mensal em reais. */
  amount: number;
  startMonth: string; // YYYY-MM
  categoryId?: string | null;
  dueDay?: number | null;
  months?: number;
}): Promise<{ itemId: string; count: number; months: string[] }> {
  const categoryId = opts.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const months = installmentMonths(opts.startMonth, opts.months ?? RECURRENCE_MONTHS);

  const item = await prisma.item.create({
    data: { name: opts.name, categoryId, dueDay: opts.dueDay ?? null, active: true },
  });
  await prisma.monthlyEntry.createMany({
    data: months.map((month) => ({
      itemId: item.id,
      month: monthToDate(month),
      plannedAmount: opts.amount,
    })),
  });
  return { itemId: item.id, count: months.length, months };
}

/**
 * Converte um lançamento avulso (sem item e sem cartão) em recorrência
 * mensal: cria o Item a partir do lançamento, vincula o lançamento existente
 * a ele e provisiona os meses seguintes com o mesmo valor.
 */
export async function convertEntryToRecurring(
  entryId: string,
  horizonMonths: number = RECURRENCE_MONTHS,
): Promise<{ ok: true; name: string; count: number } | { ok: false; error: string }> {
  const entry = await prisma.monthlyEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  if (entry.itemId) return { ok: false, error: "Este lançamento já é de uma conta recorrente." };
  if (entry.cardId) return { ok: false, error: "Lançamento de cartão não vira recorrência — a fatura já entra todo mês." };
  const name = entry.description?.trim();
  if (!name) return { ok: false, error: "Lançamento sem descrição." };

  const categoryId = entry.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const dueDay = entry.purchaseDate ? entry.purchaseDate.getUTCDate() : null;
  const startMonth = `${entry.month.getUTCFullYear()}-${String(entry.month.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = installmentMonths(startMonth, horizonMonths);

  await prisma.$transaction(async (tx) => {
    const item = await tx.item.create({ data: { name, categoryId, dueDay, active: true } });
    // O lançamento original vira o mês inicial da recorrência (o display passa
    // a usar o nome do Item; parcelamento não se aplica a recorrência).
    await tx.monthlyEntry.update({
      where: { id: entry.id },
      data: { itemId: item.id, installmentId: null, installmentSeq: null, installmentCount: null },
    });
    await tx.monthlyEntry.createMany({
      data: months.slice(1).map((month) => ({
        itemId: item.id,
        month: monthToDate(month),
        plannedAmount: entry.plannedAmount,
      })),
    });
  });
  return { ok: true, name, count: months.length };
}
