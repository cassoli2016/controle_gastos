import { cashBalance, type EntryView } from "@/lib/calc";

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

/**
 * Projeção do patrimônio mês a mês, partindo do patrimônio ATUAL (caixinhas +
 * carteira).
 *
 * Usa `cashBalance`, não `plannedBalance`: o ponto de partida já contém o
 * dinheiro das caixinhas, então um depósito precisa sair do saldo do mês — ou
 * o mesmo dinheiro apareceria duas vezes, dentro do total guardado e como
 * patrimônio novo. Guardar não enriquece ninguém, só troca o dinheiro de
 * bolso.
 */
export function patrimonyProjection(
  startCents: number,
  months: { month: string; views: EntryView[] }[],
): { month: string; totalCents: number }[] {
  return accumulateBalance(
    startCents,
    months.map((m) => ({ month: m.month, balanceCents: cashBalance(m.views) })),
  );
}
