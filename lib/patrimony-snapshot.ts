import { prisma } from "@/lib/prisma";
import { getReserves } from "@/lib/planning";
import { calcPortfolio } from "@/lib/investments";
import { sumCents, centsToNumber, decimalToCents } from "@/lib/money";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { todayISOInSaoPaulo } from "@/lib/fatura";

export type SnapshotView = {
  /** "YYYY-MM" */
  month: string;
  reservesCents: number;
  portfolioCents: number;
  totalCents: number;
  /** Última atualização da foto. */
  takenAt: Date;
};

/**
 * Registra (ou atualiza) a foto do patrimônio do mês corrente: caixinhas +
 * carteira pelo último preço. Roda todo dia pelo cron das cotações e pelo
 * botão do Dashboard; ao virar o mês, a foto anterior fica como estava.
 */
export async function takePatrimonySnapshot(todayISO: string = todayISOInSaoPaulo()): Promise<SnapshotView> {
  const [reserves, assets] = await Promise.all([
    getReserves(),
    prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } }),
  ]);
  const reservesCents = sumCents(reserves.map((r) => r.amountCents));
  const portfolioCents = calcPortfolio(
    assets.map((a) => ({
      quantity: a.quantity,
      avgPriceCents: Number(a.avgPrice) * 100,
      lastPriceCents: a.lastPrice !== null ? Math.round(Number(a.lastPrice) * 100) : null,
    })),
  ).valueCents;
  const totalCents = reservesCents + portfolioCents;
  const month = todayISO.slice(0, 7);
  const data = {
    reserves: centsToNumber(reservesCents),
    portfolio: centsToNumber(portfolioCents),
    total: centsToNumber(totalCents),
  };
  const row = await prisma.patrimonySnapshot.upsert({
    where: { month: monthToDate(month) },
    create: { month: monthToDate(month), ...data },
    update: data,
  });
  return { month, reservesCents, portfolioCents, totalCents, takenAt: row.updatedAt };
}

/** Fotos entre dois meses ("YYYY-MM", inclusive), da mais antiga à mais nova. */
export async function getPatrimonySnapshots(fromMonth: string, toMonth: string): Promise<SnapshotView[]> {
  const rows = await prisma.patrimonySnapshot.findMany({
    where: { month: { gte: monthToDate(fromMonth), lte: monthToDate(toMonth) } },
    orderBy: { month: "asc" },
  });
  return rows.map((r) => ({
    month: monthStringFromDate(r.month),
    reservesCents: decimalToCents(String(r.reserves)),
    portfolioCents: decimalToCents(String(r.portfolio)),
    totalCents: decimalToCents(String(r.total)),
    takenAt: r.updatedAt,
  }));
}
