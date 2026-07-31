/**
 * Patrimônio projetado: soma acumulada dos saldos mensais previstos partindo
 * do patrimônio ATUAL (reservas + carteira de investimentos). É estimativa —
 * investimentos flutuam e os meses são previsões.
 */
export function accumulateBalance(
  startCents: number,
  points: { month: string; balanceCents: number }[],
): { month: string; totalCents: number }[] {
  let acc = startCents;
  return points.map((p) => {
    acc += p.balanceCents;
    return { month: p.month, totalCents: acc };
  });
}
