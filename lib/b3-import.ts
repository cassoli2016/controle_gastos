import { prisma } from "@/lib/prisma";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { createDividendMonthlyEntry } from "@/lib/dividend-entry";
import type { B3Trade, B3Income } from "@/lib/b3-report";

/**
 * Data da carga inicial (posições/PM da planilha): movimentos ANTERIORES já
 * estão refletidos no preço médio importado — reaplicá-los dobraria o efeito.
 */
export const INITIAL_LOAD_CUTOFF = "2026-07-17";

export type TradeImportResult = {
  applied: number;
  buys: number;
  sells: number;
  duplicated: number;
  skippedOld: number;
  tickers: string[];
};

/**
 * Aplica os negócios do relatório de Negociação: recalcula cotas e preço
 * médio (compra pondera o PM; venda só reduz cotas) e registra cada negócio
 * com hash único — reimportar o mesmo relatório não duplica nada.
 */
export async function applyB3Trades(trades: B3Trade[]): Promise<TradeImportResult> {
  const result: TradeImportResult = { applied: 0, buys: 0, sells: 0, duplicated: 0, skippedOld: 0, tickers: [] };
  const affected = new Set<string>();

  const usable = trades
    .filter((t) => {
      if (t.dateISO < INITIAL_LOAD_CUTOFF) {
        result.skippedOld++;
        return false;
      }
      return true;
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  for (const t of usable) {
    const hash = `${t.dateISO}|${t.ticker}|${t.side}|${t.quantity}|${t.price}`;
    const existing = await prisma.investmentTransaction.findUnique({ where: { hash } });
    if (existing) {
      result.duplicated++;
      continue;
    }

    const asset = await prisma.investmentAsset.upsert({
      where: { ticker: t.ticker },
      create: { ticker: t.ticker, quantity: 0, avgPrice: 0, active: true },
      update: { active: true },
    });

    let quantity = asset.quantity;
    let avgPrice = Number(asset.avgPrice);
    if (t.side === "BUY") {
      const newQty = quantity + t.quantity;
      avgPrice = newQty > 0 ? (quantity * avgPrice + t.quantity * t.price) / newQty : 0;
      quantity = newQty;
      result.buys++;
    } else {
      quantity = Math.max(0, quantity - t.quantity);
      result.sells++;
    }
    await prisma.investmentAsset.update({
      where: { id: asset.id },
      data: { quantity, avgPrice: Math.round(avgPrice * 10000) / 10000 },
    });
    await prisma.investmentTransaction.create({
      data: {
        assetId: asset.id,
        date: new Date(t.dateISO + "T00:00:00Z"),
        side: t.side,
        quantity: t.quantity,
        price: Math.round(t.price * 10000) / 10000,
        value: Math.round(t.value * 100) / 100,
        hash,
      },
    });
    affected.add(t.ticker);
    result.applied++;
  }
  result.tickers = [...affected].sort();
  return result;
}

export type IncomeImportResult = {
  matched: number;
  created: number;
  duplicated: number;
  skippedOld: number;
  totalCents: number;
  monthEntries: number;
};

/**
 * Aplica os proventos do relatório de Movimentação: casa com a agenda "a
 * receber" (mesmo ativo, valor ±2%) marcando como recebido, ou cria um
 * provento recebido novo. Lançamento no fluxo do mês só para pagamentos do
 * mês corrente em diante (histórico não polui meses passados).
 */
export async function applyB3Incomes(incomes: B3Income[]): Promise<IncomeImportResult> {
  const result: IncomeImportResult = {
    matched: 0,
    created: 0,
    duplicated: 0,
    skippedOld: 0,
    totalCents: 0,
    monthEntries: 0,
  };
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);

  for (const income of incomes) {
    if (income.dateISO < INITIAL_LOAD_CUTOFF) {
      result.skippedOld++;
      continue;
    }
    const valueCents = Math.round(income.value * 100);
    const payDate = new Date(income.dateISO + "T00:00:00Z");

    const asset = await prisma.investmentAsset.upsert({
      where: { ticker: income.ticker },
      create: { ticker: income.ticker, quantity: 0, avgPrice: 0, active: false },
      update: {},
    });

    // Dedup: mesmo ativo, mesma data e mesmo valor já recebidos.
    const dup = await prisma.dividend.findFirst({
      where: { assetId: asset.id, received: true, payDate, net: centsToNumber(valueCents) },
    });
    if (dup) {
      result.duplicated++;
      continue;
    }

    // Casa com a agenda: pendente do mesmo ativo com valor líquido ±2%.
    const pending = await prisma.dividend.findMany({ where: { assetId: asset.id, received: false } });
    const tolerance = Math.max(2, Math.round(valueCents * 0.02));
    const match = pending.find((d) => Math.abs(decimalToCents(String(d.net)) - valueCents) <= tolerance);

    let dividendId: string;
    if (match) {
      await prisma.dividend.update({
        where: { id: match.id },
        data: { received: true, payDate, net: centsToNumber(valueCents) },
      });
      dividendId = match.id;
      result.matched++;
    } else {
      const created = await prisma.dividend.create({
        data: {
          assetId: asset.id,
          type: income.type,
          payDate,
          quantity: income.quantity ?? 0,
          unitValue: income.unitValue ?? 0,
          gross: centsToNumber(valueCents),
          net: centsToNumber(valueCents),
          received: true,
        },
      });
      dividendId = created.id;
      result.created++;
    }
    result.totalCents += valueCents;

    // Fluxo do mês: só do mês corrente em diante.
    if (income.dateISO.slice(0, 7) >= currentMonth) {
      const entryId = await createDividendMonthlyEntry({
        type: income.type,
        net: centsToNumber(valueCents),
        payDate,
        asset: { ticker: income.ticker },
      });
      await prisma.dividend.update({ where: { id: dividendId }, data: { entryId } });
      result.monthEntries++;
    }
  }
  return result;
}

export type ProvisionedImportResult = {
  created: number;
  updated: number;
  duplicated: number;
  totalCents: number;
};

/**
 * Proventos PROVISIONADOS (anunciados, ainda não pagos): alimentam a agenda
 * "a receber". Pendente do mesmo ativo com valor ±2% ganha a data de previsão
 * (refresca placeholders); sem correspondência, cria pendente novo.
 */
export async function applyB3Provisioned(incomes: B3Income[]): Promise<ProvisionedImportResult> {
  const result: ProvisionedImportResult = { created: 0, updated: 0, duplicated: 0, totalCents: 0 };

  for (const income of incomes) {
    const valueCents = Math.round(income.value * 100);
    const payDate = new Date(income.dateISO + "T00:00:00Z");

    const asset = await prisma.investmentAsset.upsert({
      where: { ticker: income.ticker },
      create: { ticker: income.ticker, quantity: 0, avgPrice: 0, active: false },
      update: {},
    });

    // Já recebido com a mesma data/valor? Nada a fazer.
    const dupReceived = await prisma.dividend.findFirst({
      where: { assetId: asset.id, received: true, payDate, net: centsToNumber(valueCents) },
    });
    if (dupReceived) {
      result.duplicated++;
      continue;
    }

    const pending = await prisma.dividend.findMany({ where: { assetId: asset.id, received: false } });
    const tolerance = Math.max(2, Math.round(valueCents * 0.02));
    const match = pending.find((d) => Math.abs(decimalToCents(String(d.net)) - valueCents) <= tolerance);
    if (match) {
      // Mesmo anúncio: se a data já bate, é duplicata; senão refresca a previsão.
      if (match.payDate.getTime() === payDate.getTime()) {
        result.duplicated++;
      } else {
        await prisma.dividend.update({
          where: { id: match.id },
          data: {
            payDate,
            quantity: income.quantity ?? match.quantity,
            unitValue: income.unitValue ?? match.unitValue,
          },
        });
        result.updated++;
      }
    } else {
      await prisma.dividend.create({
        data: {
          assetId: asset.id,
          type: income.type,
          payDate,
          quantity: income.quantity ?? 0,
          unitValue: income.unitValue ?? 0,
          gross: centsToNumber(valueCents),
          net: centsToNumber(valueCents),
          received: false,
        },
      });
      result.created++;
    }
    result.totalCents += valueCents;
  }
  return result;
}
