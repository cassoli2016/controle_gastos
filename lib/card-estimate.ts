/**
 * Acompanhamento do teto de gastos do cartão.
 *
 * O teto NÃO provisiona despesa nos meses futuros: chegou a fazer isso na
 * v1.24.0 e a projeção virou um vermelho constante, porque a reserva do dia a
 * dia (R$ 135/dia) já cobre o mesmo gasto que passa na fatura — mercado,
 * restaurante e combustível somaram R$ 6.591,48 em set/2026. Contar os dois
 * era contar duas vezes. Aqui o teto serve só para comparar com a fatura que
 * está se formando.
 */

export type CardCycleStatus = {
  cardId: string;
  name: string;
  /** Competência do ciclo acompanhado. */
  monthISO: string;
  bookedCents: number;
  limitCents: number;
  /** Quanto ainda cabe no teto; zero quando já passou. */
  remainingCents: number;
  /** Percentual do teto já ocupado; pode passar de 100. */
  pct: number;
};

/**
 * Quanto o PRÓXIMO ciclo de cada cartão já comprometeu do teto.
 *
 * Acompanha o mês seguinte porque a fatura do mês corrente já fechou (ou está
 * fechando) — para ela não há mais o que decidir. O que ainda dá para mudar é
 * a fatura que está se formando agora.
 *
 * Conta a fatura INTEIRA, parcelas antigas incluídas: elas ocupam o mesmo teto
 * que as compras novas, e ignorá-las daria uma folga que não existe.
 */
export function cardCycleStatus(
  cards: { id: string; name: string; estimateCents: number | null }[],
  currentMonth: string,
  bookedByCard: Record<string, number>,
): CardCycleStatus[] {
  const [y, m] = currentMonth.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const monthISO = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;

  return cards
    .filter((c) => c.estimateCents !== null && c.estimateCents > 0)
    .map((c) => {
      const limitCents = c.estimateCents as number;
      const bookedCents = bookedByCard[c.id] ?? 0;
      return {
        cardId: c.id,
        name: c.name,
        monthISO,
        bookedCents,
        limitCents,
        remainingCents: Math.max(0, limitCents - bookedCents),
        pct: Math.round((bookedCents / limitCents) * 100),
      };
    });
}
