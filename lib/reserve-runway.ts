import { shiftMonth } from "@/lib/month-nav";

/**
 * Caixinhas + saldo a realizar, mês a mês: "se tudo o que está lançado
 * acontecer, quanto eu tenho no fim de cada mês?".
 *
 * Parte do total das caixinhas de HOJE e soma, em ordem, o saldo a realizar
 * de cada mês (o rodapé do Panorama: o que ainda entra menos o que ainda sai,
 * só do que não foi baixado — docs/saldo-a-realizar.md). Usar o a realizar, e
 * não o saldo do mês inteiro, é o ponto: o que já foi recebido ou pago este
 * mês já está (ou já saiu) das caixinhas, e somar de novo contaria em dobro.
 *
 * Mês passado com conta em aberto (atrasada) não vira ponto próprio: o
 * dinheiro ainda vai sair, então entra no mês corrente e fica exposto em
 * `overdueCents` para a tela avisar.
 *
 * Puro — quem lê o banco é a página do Panorama.
 */
export type RunwayPoint = {
  month: string;
  /** Saldo a realizar do mês (o corrente já inclui os atrasados). */
  toComeCents: number;
  /** Caixinhas de hoje + todos os saldos a realizar até este mês, inclusive. */
  accumulatedCents: number;
};

export type Runway = { points: RunwayPoint[]; overdueCents: number };

export function reserveRunway(startCents: number, balanceByMonth: Record<string, number>, currentMonth: string): Runway {
  const months = Object.keys(balanceByMonth).sort();
  const overdueCents = months.filter((m) => m < currentMonth).reduce((a, m) => a + balanceByMonth[m], 0);
  const ahead = months.filter((m) => m >= currentMonth);
  // O mês corrente existe mesmo sem lançamento quando há atraso a levar.
  if (overdueCents !== 0 && ahead[0] !== currentMonth) ahead.unshift(currentMonth);

  let accumulatedCents = startCents;
  const points = ahead.map((month) => {
    const toComeCents = (balanceByMonth[month] ?? 0) + (month === currentMonth ? overdueCents : 0);
    accumulatedCents += toComeCents;
    return { month, toComeCents, accumulatedCents };
  });
  return { points, overdueCents };
}

/** Mês destacado ao abrir: um ano à frente do corrente, ou o último lançado. */
export function defaultRunwayMonth(points: RunwayPoint[], currentMonth: string): string | null {
  if (points.length === 0) return null;
  const target = shiftMonth(currentMonth, 12);
  return points.find((p) => p.month === target)?.month ?? points[points.length - 1].month;
}

/** Soma dos saldos a realizar do primeiro ponto até `month`, inclusive. */
export function toComeUntil(points: RunwayPoint[], month: string): number {
  return points.filter((p) => p.month <= month).reduce((a, p) => a + p.toComeCents, 0);
}
