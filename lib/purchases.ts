import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { installmentMonths } from "@/lib/installments";

/** Categoria padrão de compras avulsas (criada sob demanda). */
export const DEFAULT_PURCHASE_CATEGORY = {
  name: "Cartão/Compras",
  type: "EXPENSE" as const,
  color: "#64748b",
};

/**
 * Busca a categoria padrão "Cartão/Compras"; cria se ainda não existir.
 * Find-or-create simples (Category.name não tem constraint única).
 */
export async function resolveDefaultPurchaseCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: DEFAULT_PURCHASE_CATEGORY.name } });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: DEFAULT_PURCHASE_CATEGORY });
  return created.id;
}

/** Categoria padrão de recebimentos (find-or-create; prefere a existente "Recebimentos"). */
export async function resolveIncomeCategoryId(): Promise<string> {
  const byName = await prisma.category.findFirst({ where: { name: "Recebimentos" } });
  if (byName) return byName.id;
  const anyIncome = await prisma.category.findFirst({ where: { type: "INCOME" } });
  if (anyIncome) return anyIncome.id;
  const created = await prisma.category.create({
    data: { name: "Recebimentos", type: "INCOME", color: "#10b981" },
  });
  return created.id;
}

export type PurchaseInput = {
  description: string;
  /** Valor POR parcela, em reais. */
  amount: number;
  installments: number;
  startMonth: string; // YYYY-MM
  cardId?: string | null;
  categoryId?: string | null; // null/undefined → categoria padrão
  /** Data do lançamento (YYYY-MM-DD) — gravada em todas as parcelas. */
  purchaseDateISO?: string;
};

/**
 * Núcleo do lançamento de compra (usado pela UI e pelo bot do Telegram):
 * cria 1 MonthlyEntry por parcela numa única transação, todas ligadas pelo
 * mesmo installmentId.
 */
export async function createPurchaseCore(input: PurchaseInput): Promise<{ count: number }> {
  const categoryId = input.categoryId ?? (await resolveDefaultPurchaseCategoryId());
  const months = installmentMonths(input.startMonth, input.installments);
  const installmentId = crypto.randomUUID();

  const purchaseDate = input.purchaseDateISO ? new Date(input.purchaseDateISO + "T00:00:00Z") : null;
  await prisma.$transaction(async (tx) => {
    for (let seq = 0; seq < months.length; seq++) {
      await tx.monthlyEntry.create({
        data: {
          installmentId,
          installmentSeq: seq + 1,
          installmentCount: input.installments,
          description: input.description,
          purchaseDate,
          categoryId,
          cardId: input.cardId ?? null,
          month: monthToDate(months[seq]),
          plannedAmount: input.amount,
        },
      });
    }
  });

  return { count: input.installments };
}

export type BatchPurchaseRow = {
  description: string;
  /** Valor POR parcela, em reais. */
  amount: number;
  installments: number;
  cardId?: string | null;
  /** Data do lançamento (YYYY-MM-DD). */
  purchaseDateISO?: string;
};

/**
 * Importa várias compras de uma vez (lote do bot: mensagem multi-linha ou CSV
 * de fatura) num único createMany — ou importa tudo, ou nada. Compras
 * parceladas viram N MonthlyEntry ligados pelo mesmo installmentId.
 */
export async function createPurchasesBatch(
  rows: BatchPurchaseRow[],
  startMonth: string,
  categoryId?: string | null,
): Promise<{ purchases: number; entries: number; totalCents: number }> {
  const catId = categoryId ?? (await resolveDefaultPurchaseCategoryId());
  let totalCents = 0;
  const data = rows.flatMap((row) => {
    const months = installmentMonths(startMonth, row.installments);
    const installmentId = crypto.randomUUID();
    totalCents += Math.round(row.amount * 100) * row.installments;
    return months.map((month, i) => ({
      installmentId,
      installmentSeq: i + 1,
      installmentCount: row.installments,
      description: row.description,
      purchaseDate: row.purchaseDateISO ? new Date(row.purchaseDateISO + "T00:00:00Z") : null,
      categoryId: catId,
      cardId: row.cardId ?? null,
      month: monthToDate(month),
      plannedAmount: row.amount,
    }));
  });
  await prisma.monthlyEntry.createMany({ data });
  return { purchases: rows.length, entries: data.length, totalCents };
}
