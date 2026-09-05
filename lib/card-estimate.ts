/**
 * Compras que ainda vão acontecer no cartão.
 *
 * A fatura de um mês futuro só contém as parcelas já lançadas, então ela
 * derrete quanto mais longe se olha: as faturas conhecidas somavam em média
 * R$ 21.776,49, e o app previa R$ 670,93 para jun/2027. O saldo desses meses
 * aparecia positivo por falta de despesa, não por sobra de dinheiro.
 *
 * A provisão é o que FALTA para chegar na estimativa, nunca a estimativa
 * cheia: as parcelas já lançadas continuam valendo e não podem ser contadas
 * duas vezes. Quando a fatura real chega e passa da estimativa, a provisão
 * some sozinha.
 */

/** Rótulo da categoria da linha derivada (agrupa os cartões numa seção só). */
export const CARD_ESTIMATE_CATEGORY = "Compras estimadas";
/** Prefixo do id sintético: um por cartão, para não somarem na mesma fatia. */
export const CARD_ESTIMATE_ENTRY_PREFIX = "card-estimate:";

export type CardEstimateInput = {
  /** Competência da fatura (YYYY-MM). */
  monthISO: string;
  currentMonth: string;
  /** Gasto mensal esperado no cartão; null = sem estimativa configurada. */
  estimateCents: number | null;
  /** Consolidado já lançado nessa competência. */
  bookedCents: number;
};

/**
 * Só provisiona mês POSTERIOR ao corrente: a fatura do mês em curso já está
 * formada (fechada ou fechando), e estimar por cima dela seria inventar
 * despesa que as compras do mês já explicam.
 */
export function cardEstimateCents(input: CardEstimateInput): number {
  const { monthISO, currentMonth, estimateCents, bookedCents } = input;
  if (!estimateCents || estimateCents <= 0) return 0;
  if (monthISO <= currentMonth) return 0;
  return Math.max(0, estimateCents - bookedCents);
}

export type CardEstimateLine = { cardId: string; line: string; cents: number };

/** Uma linha por cartão que ainda tem estimativa a completar no mês. */
export function cardEstimateLines(
  cards: { id: string; name: string; estimateCents: number | null }[],
  monthISO: string,
  currentMonth: string,
  bookedByCard: Record<string, number>,
): CardEstimateLine[] {
  return cards
    .map((c) => ({
      cardId: c.id,
      line: `${c.name} · compras estimadas`,
      cents: cardEstimateCents({
        monthISO,
        currentMonth,
        estimateCents: c.estimateCents,
        bookedCents: bookedByCard[c.id] ?? 0,
      }),
    }))
    .filter((l) => l.cents > 0);
}
