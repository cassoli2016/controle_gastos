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

export type PatrimonyChartPoint = {
  month: string;
  /** Projeção (plano). Ausente nos meses passados, que só têm o registrado. */
  totalCents?: number;
  /** Projeção com o gasto variável observado (lib/trend.ts). */
  trendCents?: number;
  /** O que foi registrado de fato (foto mensal: caixinhas + carteira). */
  realCents?: number;
};

/**
 * Junta o histórico registrado com a projeção: meses passados entram só com o
 * real; meses da projeção levam o real quando também há foto deles (o mês
 * corrente, normalmente), para a linha registrada encostar na projetada.
 */
export function withHistory(
  history: { month: string; totalCents: number }[],
  projection: { month: string; totalCents: number; trendCents?: number }[],
): PatrimonyChartPoint[] {
  const projected = new Set(projection.map((p) => p.month));
  const real = new Map(history.map((h) => [h.month, h.totalCents]));
  const past = history.filter((h) => !projected.has(h.month)).map((h) => ({ month: h.month, realCents: h.totalCents }));
  const future = projection.map((p) => (real.has(p.month) ? { ...p, realCents: real.get(p.month) } : { ...p }));
  return [...past, ...future];
}
