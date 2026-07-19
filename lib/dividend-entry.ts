import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";

/** Categoria dos dividendos no fluxo mensal (find-or-create, INCOME). */
export async function resolveDividendCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: "Dividendos" } });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: "Dividendos", type: "INCOME", color: "#059669" },
  });
  return created.id;
}

/**
 * Cria o lançamento pago do provento no mês do pagamento e devolve o id.
 * (Usado ao marcar recebido na UI e na importação de relatórios da B3.)
 */
export async function createDividendMonthlyEntry(dividend: {
  type: string;
  net: unknown;
  payDate: Date;
  asset: { ticker: string };
}): Promise<string> {
  const categoryId = await resolveDividendCategoryId();
  const netCents = decimalToCents(String(dividend.net));
  const month = monthStringFromDate(dividend.payDate);
  const entry = await prisma.monthlyEntry.create({
    data: {
      description: `${dividend.type} ${dividend.asset.ticker}`,
      categoryId,
      month: monthToDate(month),
      plannedAmount: centsToNumber(netCents),
      purchaseDate: dividend.payDate,
      paid: true,
      paidAmount: centsToNumber(netCents),
      paidDate: new Date(),
    },
  });
  return entry.id;
}
