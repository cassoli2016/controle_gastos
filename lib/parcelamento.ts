/**
 * À vista com desconto ou parcelado sem juros?
 *
 * A comparação NÃO é pelo total: R$ 5.000 em 10x de R$ 500 custam menos que
 * R$ 5.000 hoje, porque as nove primeiras parcelas ficam rendendo na reserva
 * até vencerem. Cada parcela é trazida a valor de hoje pelo rendimento da
 * caixinha, e é esse valor que se compara com o preço à vista.
 *
 * O mesmo resultado pelo outro lado: o desconto à vista embute uma taxa mensal
 * (`embeddedRatePct`). Se ela for menor que o rendimento, parcelar ganha.
 */

export type ParcelamentoInput = {
  /** Preço cheio, o de etiqueta. */
  fullCents: number;
  /** Desconto oferecido para pagamento à vista, em %. */
  discountPct: number;
  /** Total no parcelado. Ausente = igual ao preço cheio (parcelamento sem juros). */
  financedCents?: number;
  maxInstallments: number;
  /** Quanto a reserva rende por mês, em %. É o custo de oportunidade do à vista. */
  monthlyRatePct: number;
};

export type ParcelaOption = {
  n: number;
  parcelCents: number;
  totalCents: number;
  /** As parcelas trazidas a valor de hoje. */
  presentValueCents: number;
  /** Preço à vista − valor presente: positivo = parcelar economiza. */
  savingCents: number;
  /** Taxa mensal que iguala as parcelas ao preço à vista; 0 quando não há juro a extrair. */
  embeddedRatePct: number;
};

export type ParcelamentoResult = {
  cashCents: number;
  options: ParcelaOption[];
  /** Menor prazo em que parcelar passa a compensar; null se nunca compensa. */
  breakEvenN: number | null;
  /** A opção que mais economiza, ou null quando à vista ganha em todo prazo. */
  best: ParcelaOption | null;
};

/**
 * Valor de hoje de `n` parcelas de `parcelCents`, a primeira daqui a um mês.
 *
 * A primeira parcela já é descontada (expoente começa em 1) porque compra no
 * cartão não sai da conta na hora: ela cai na fatura seguinte.
 */
export function presentValueCents(parcelCents: number, n: number, monthlyRatePct: number): number {
  const i = monthlyRatePct / 100;
  let total = 0;
  for (let k = 1; k <= n; k++) total += parcelCents / (1 + i) ** k;
  return Math.round(total);
}

/**
 * Taxa mensal que faz as parcelas valerem exatamente o preço à vista — o juro
 * que o desconto esconde. Bissecção: o valor presente cai quando a taxa sobe.
 */
function embeddedRate(parcelCents: number, n: number, cashCents: number): number {
  if (presentValueCents(parcelCents, n, 0) <= cashCents) return 0;
  let lo = 0;
  let hi = 100; // 100% ao mês: teto absurdo de propósito, só para fechar o intervalo
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (presentValueCents(parcelCents, n, mid) > cashCents) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function compareParcelamento(input: ParcelamentoInput): ParcelamentoResult {
  const { fullCents, discountPct, maxInstallments, monthlyRatePct } = input;
  const financedCents = input.financedCents ?? fullCents;
  const cashCents = Math.round(fullCents * (1 - discountPct / 100));

  const options: ParcelaOption[] = [];
  for (let n = 1; n <= maxInstallments; n++) {
    const parcelCents = Math.round(financedCents / n);
    const pv = presentValueCents(parcelCents, n, monthlyRatePct);
    options.push({
      n,
      parcelCents,
      totalCents: parcelCents * n,
      presentValueCents: pv,
      savingCents: cashCents - pv,
      embeddedRatePct: embeddedRate(parcelCents, n, cashCents),
    });
  }

  const ganhando = options.filter((o) => o.savingCents > 0);
  return {
    cashCents,
    options,
    breakEvenN: ganhando.length > 0 ? ganhando[0].n : null,
    best:
      ganhando.length > 0
        ? ganhando.reduce((a, b) => (b.savingCents > a.savingCents ? b : a))
        : null,
  };
}
