import { prisma } from "@/lib/prisma";
import { fetchQuotes } from "@/lib/brapi";
import { calcPortfolio } from "@/lib/investments";

export type RefreshResult = {
  updated: number;
  total: number;
  /** Valor atual da carteira em centavos (após atualizar). */
  valueCents: number;
  /** Resultado total vs custo, em centavos. */
  resultCents: number;
  resultPct: number | null;
  /** Variação do DIA em centavos (Σ cotas × variação por cota dos cotados). */
  dayCents: number;
};

/**
 * Atualiza as cotações de todos os ativos ativos (cache no banco) e devolve
 * o retrato da carteira — usado pelo botão da página e pelo cron diário.
 */
export async function refreshAllQuotes(): Promise<RefreshResult> {
  const assets = await prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } });
  const quotes = await fetchQuotes(assets.map((a) => a.ticker));

  let updated = 0;
  let dayCents = 0;
  for (const asset of assets) {
    const q = quotes.get(asset.ticker);
    if (!q) continue;
    await prisma.investmentAsset.update({
      where: { id: asset.id },
      data: { lastPrice: q.price, priceAt: new Date(), name: q.name ?? asset.name },
    });
    if (q.change !== null) dayCents += Math.round(asset.quantity * q.change * 100);
    updated++;
  }

  const fresh = await prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } });
  const totals = calcPortfolio(
    fresh.map((a) => ({
      quantity: a.quantity,
      avgPriceCents: Number(a.avgPrice) * 100,
      lastPriceCents: a.lastPrice !== null ? Math.round(Number(a.lastPrice) * 100) : null,
    })),
  );
  return {
    updated,
    total: assets.length,
    valueCents: totals.valueCents,
    resultCents: totals.resultCents,
    resultPct: totals.resultPct,
    dayCents,
  };
}
