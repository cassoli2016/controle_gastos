/**
 * A fatura como ESTADO dos planos de parcelamento: ela diz qual parcela foi
 * cobrada, e disso decorre a cauda dos meses seguintes.
 *
 * Um único mecanismo cobre os três casos que antes eram especiais:
 *   normal              fatura mostra 8/12         → cauda 9..12
 *   quitação antecipada fatura mostra 10/10        → cauda vazia
 *   parcela atrasada    app tinha 3/6, fatura não  → cobrado até 2, cauda 3..6
 */
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { planKey, type FaturaLine } from "@/lib/fatura-core";
import type { AppRow } from "@/lib/fatura-match";

export type PlanState = {
  key: string;
  /** Descrição de referência, usada ao gerar as linhas da cauda. */
  description: string;
  count: number;
  /** Valor por parcela. */
  cents: number;
  /** Última parcela que o banco cobrou. */
  chargedThrough: number;
};

/**
 * Estado de cada plano. A FATURA manda: `chargedThrough` é a maior parcela que
 * ela cobrou. Plano que só aparece nas órfãs (o app esperava a parcela e o banco
 * não cobrou) entra como cobrado até a ANTERIOR — é o que produz o deslocamento.
 */
export function faturaPlanStates(lines: FaturaLine[], orphans: AppRow[]): Map<string, PlanState> {
  const states = new Map<string, PlanState>();
  for (const line of lines) {
    if (line.kind !== "purchase" || !line.installment) continue;
    const key = planKey(line, line.installment);
    const current = states.get(key);
    if (!current || line.installment.seq > current.chargedThrough) {
      states.set(key, {
        key,
        description: line.description.replace(/^Antecipada - /, ""),
        count: line.installment.count,
        cents: line.cents,
        chargedThrough: Math.max(line.installment.seq, current?.chargedThrough ?? 0),
      });
    }
  }
  for (const orphan of orphans) {
    if (!orphan.installment) continue; // à vista não é plano
    const key = planKey(orphan, orphan.installment);
    if (states.has(key)) continue; // a fatura já disse o estado; ela ganha
    states.set(key, {
      key,
      description: orphan.description,
      count: orphan.installment.count,
      cents: orphan.cents,
      chargedThrough: orphan.installment.seq - 1,
    });
  }
  return states;
}

/** "2026-08" + 1 → "2026-09". Exportada porque o aplicador também precisa. */
export function shiftMonthISO(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** As parcelas que ainda faltam, uma por mês a partir do mês seguinte ao da fatura. */
export function expectedTail(state: PlanState, faturaMonth: string): { month: string; seq: number }[] {
  const tail: { month: string; seq: number }[] = [];
  for (let seq = state.chargedThrough + 1; seq <= state.count; seq++) {
    tail.push({ month: shiftMonthISO(faturaMonth, seq - state.chargedThrough), seq });
  }
  return tail;
}
