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
