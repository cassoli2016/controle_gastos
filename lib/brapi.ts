/**
 * Cotações da B3 via brapi.dev. Requer BRAPI_TOKEN no ambiente (plano
 * gratuito: criar em brapi.dev). Sem token, as chamadas falham graciosamente
 * e o app segue exibindo a última cotação cacheada no banco.
 */

export type Quote = {
  ticker: string;
  price: number;
  /** Variação do dia em fração (0.0123 = +1,23%). */
  changePercent: number | null;
  /** Variação do dia em R$ por cota. */
  change: number | null;
  name: string | null;
};

/**
 * Busca cotações uma a uma (o plano gratuito do brapi limita a 1 ativo por
 * requisição). Falhas individuais não derrubam o lote — o ticker fica de fora.
 */
export async function fetchQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  const token = process.env.BRAPI_TOKEN;
  const result = new Map<string, Quote>();
  for (const ticker of tickers) {
    try {
      const url = new URL(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`);
      if (token) url.searchParams.set("token", token);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: {
          symbol?: string;
          regularMarketPrice?: number;
          regularMarketChangePercent?: number;
          regularMarketChange?: number;
          longName?: string;
          shortName?: string;
        }[];
      };
      const q = data.results?.[0];
      if (!q?.regularMarketPrice) continue;
      result.set(ticker.toUpperCase(), {
        ticker: ticker.toUpperCase(),
        price: q.regularMarketPrice,
        changePercent: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent / 100 : null,
        change: typeof q.regularMarketChange === "number" ? q.regularMarketChange : null,
        name: q.longName ?? q.shortName ?? null,
      });
    } catch {
      // timeout/rede: segue para o próximo ticker
    }
  }
  return result;
}
