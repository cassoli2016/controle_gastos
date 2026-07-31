/**
 * Uso estimado do limite do cartão: soma das faturas NÃO PAGAS do mês corrente
 * em diante — o saldo comprometido que o app conhece. "Estimado" porque o
 * banco inclui encargos e corta em datas próprias.
 */
export function estimateCardUsage(entries: { cents: number; paid: boolean }[]): number {
  return entries.filter((e) => !e.paid).reduce((acc, e) => acc + e.cents, 0);
}

/** Cor da barra de uso por faixa de percentual: <60 verde, <85 âmbar, ≥85 vermelho. */
export function usageTone(pct: number): "emerald" | "amber" | "rose" {
  if (pct < 60) return "emerald";
  if (pct < 85) return "amber";
  return "rose";
}
