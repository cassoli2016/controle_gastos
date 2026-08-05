/**
 * Um CSV exportado do banco é sempre de UMA fatura. Quando o roteamento por data
 * espalha as linhas em vários meses, só o mês majoritário pode ser SUBSTITUÍDO —
 * os outros recebem inserção aditiva.
 *
 * Sem isso, o corte intradiário da fatura do Nubank (emitida às 03:31 do dia do
 * fechamento) manda umas poucas linhas para o mês já fechado, e o replace apaga
 * a fatura fechada inteira: medido, 229 lançamentos virando 5.
 */
export function pickFaturaMonth<T>(rowsByMonth: Map<string, T[]>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [month, rows] of rowsByMonth) {
    // Empate vence o mês mais recente: a fatura em aberto é a que está sendo
    // exportada.
    if (rows.length > bestCount || (rows.length === bestCount && best !== null && month > best)) {
      best = month;
      bestCount = rows.length;
    }
  }
  return best;
}
