/** Cálculos puros da carteira (centavos inteiros, como no resto do app). */

export type PositionInput = {
  quantity: number;
  /** Preço médio em centavos (pode ter fração de centavo — usar número). */
  avgPriceCents: number;
  lastPriceCents: number | null;
};

export type PositionCalc = {
  /** Custo total da posição (cotas × PM), em centavos. */
  costCents: number;
  /** Valor atual (cotas × cotação), em centavos — null sem cotação. */
  valueCents: number | null;
  /** Resultado (valor − custo), em centavos — null sem cotação. */
  resultCents: number | null;
  /** Resultado percentual (fração) — null sem cotação ou custo zero. */
  resultPct: number | null;
};

export function calcPosition(p: PositionInput): PositionCalc {
  const costCents = Math.round(p.quantity * p.avgPriceCents);
  const valueCents = p.lastPriceCents !== null ? Math.round(p.quantity * p.lastPriceCents) : null;
  const resultCents = valueCents !== null ? valueCents - costCents : null;
  const resultPct = resultCents !== null && costCents > 0 ? resultCents / costCents : null;
  return { costCents, valueCents, resultCents, resultPct };
}

export type PortfolioTotals = {
  costCents: number;
  /** Soma dos valores atuais (posições sem cotação entram pelo custo). */
  valueCents: number;
  resultCents: number;
  resultPct: number | null;
  /** Quantas posições estão sem cotação (valor caiu no custo). */
  missingQuotes: number;
};

export function calcPortfolio(positions: PositionInput[]): PortfolioTotals {
  let costCents = 0;
  let valueCents = 0;
  let missingQuotes = 0;
  for (const p of positions) {
    const c = calcPosition(p);
    costCents += c.costCents;
    if (c.valueCents === null) {
      valueCents += c.costCents;
      missingQuotes++;
    } else {
      valueCents += c.valueCents;
    }
  }
  const resultCents = valueCents - costCents;
  return {
    costCents,
    valueCents,
    resultCents,
    resultPct: costCents > 0 ? resultCents / costCents : null,
    missingQuotes,
  };
}

/** Formata fração como percentual pt-BR: 0.1804 → "+18,04%". */
export function formatPct(frac: number | null): string {
  if (frac === null) return "—";
  const pct = frac * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Paleta fixa para gráficos por ativo (ordem estável). */
export const ASSET_PALETTE = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#06b6d4",
  "#ef4444", "#84cc16", "#ec4899", "#14b8a6", "#f97316",
  "#6366f1", "#a855f7",
];

export type AllocationSlice = { ticker: string; valueCents: number; frac: number; color: string };

/** Alocação da carteira por ativo (% do valor atual; sem cotação usa o custo). */
export function allocation(
  positions: { ticker: string; quantity: number; avgPriceCents: number; lastPriceCents: number | null }[],
): AllocationSlice[] {
  const values = positions.map((p) => {
    const c = calcPosition(p);
    return { ticker: p.ticker, valueCents: c.valueCents ?? c.costCents };
  });
  const total = values.reduce((acc, v) => acc + v.valueCents, 0);
  return values
    .sort((a, b) => b.valueCents - a.valueCents)
    .map((v, i) => ({
      ...v,
      frac: total > 0 ? v.valueCents / total : 0,
      color: ASSET_PALETTE[i % ASSET_PALETTE.length],
    }));
}

/**
 * Soma dos proventos por competência (YYYY-MM), alinhada à lista de meses
 * pedida — meses sem provento entram com 0.
 */
export function sumDividendsByMonth(
  dividends: { payMonthISO: string; netCents: number }[],
  monthsISO: string[],
): number[] {
  const acc = new Map<string, number>(monthsISO.map((m) => [m, 0]));
  for (const d of dividends) {
    if (acc.has(d.payMonthISO)) acc.set(d.payMonthISO, acc.get(d.payMonthISO)! + d.netCents);
  }
  return monthsISO.map((m) => acc.get(m) ?? 0);
}
