/**
 * Casamento entre um provento da B3 (anunciado ou pago) e a agenda de
 * proventos a receber. Lógica pura — o acesso ao banco fica em b3-import.
 */

/** Pendente da agenda, com o valor líquido já convertido para centavos. */
export type PendingDividendRef = { id: string; payDate: Date; netCents: number };

export type DividendMatchOptions = {
  /** Valor líquido do provento da B3, em centavos. */
  valueCents: number;
  /** Data do provento: previsão de pagamento (anúncio) ou pagamento (pago). */
  date: Date;
  /** Pendentes já casados nesta importação — cada um casa com um provento só. */
  used?: ReadonlySet<string>;
  /**
   * Aceita previsão arbitrariamente ATRASADA em relação à data do provento.
   * Ligado para proventos pagos (a previsão da agenda pode ser um placeholder
   * antigo); desligado para anúncios, onde a previsão anda junto com a data.
   */
  allowStale?: boolean;
};

/**
 * Tolerância de valor: 2% (mínimo 2 centavos). A agenda costuma vir de
 * estimativa (bruto x líquido, arredondamento manual) e não bate no centavo.
 */
function toleranceFor(valueCents: number): number {
  return Math.max(2, Math.round(valueCents * 0.02));
}

/**
 * Janela de dias entre a previsão da agenda e a data do provento. Existe para
 * o provento não dar baixa/refrescar o anúncio do ciclo seguinte quando o
 * valor repete: ALOS3 reembolsa ~R$ 291 todo mês e RECV3 anuncia R$ 477,85
 * para 2026, 2027 e 2028 — sem a janela, o de 2026 virava o de 2027.
 */
export const MATCH_WINDOW_DAYS = 15;

const DAY_MS = 86_400_000;

/**
 * Qual pendente da agenda este provento representa, ou null se é novidade.
 *
 * Ordem de preferência: valor exato antes de aproximado (CMIG4 paga 8,87 e
 * 8,98 no mesmo dia — 11 centavos cabem nos 2% e uma engolia a outra), depois
 * a data mais próxima.
 */
export function pickDividendMatch<T extends PendingDividendRef>(
  pendings: T[],
  { valueCents, date, used, allowStale }: DividendMatchOptions,
): T | null {
  const tolerance = toleranceFor(valueCents);
  const candidates = pendings
    .filter((p) => !used?.has(p.id))
    .map((p) => ({
      pending: p,
      exact: p.netCents === valueCents,
      diff: Math.abs(p.netCents - valueCents),
      /** Positivo = previsão à frente do provento; negativo = atrasada. */
      days: Math.round((p.payDate.getTime() - date.getTime()) / DAY_MS),
    }))
    .filter(
      (c) =>
        c.diff <= tolerance &&
        c.days <= MATCH_WINDOW_DAYS &&
        (allowStale || -c.days <= MATCH_WINDOW_DAYS),
    );

  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => Number(b.exact) - Number(a.exact) || Math.abs(a.days) - Math.abs(b.days) || a.diff - b.diff,
  );
  return candidates[0].pending;
}
