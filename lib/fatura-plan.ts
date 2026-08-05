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

export type TailAction =
  | { kind: "delete"; id: string }
  | { kind: "insert"; month: string; description: string; cents: number; seq: number; count: number };

/** Descrição da parcela `seq` de um plano, no formato do marcador Nubank. */
function tailDescription(state: PlanState, seq: number): string {
  const base = state.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, "");
  return `${base} - Parcela ${seq}/${state.count}`;
}

/**
 * Acerta os meses FUTUROS para a cauda que a fatura implica: apaga a parcela do
 * plano que está no mês errado, insere a que falta.
 *
 * Toca SÓ linhas de planos que a fatura conhece. Compra à vista e plano que a
 * fatura não lista (compra feita depois do fechamento) sobrevivem intactos — foi
 * a falta desta garantia que apagava R$ 941,04 de setembro na regra por data.
 */
export function reconcileTail(opts: {
  states: Map<string, PlanState>;
  faturaMonth: string;
  existingByMonth: Map<string, AppRow[]>;
}): TailAction[] {
  const { states, faturaMonth, existingByMonth } = opts;

  // Onde cada plano DEVE ter parcela: planKey → mês → seq.
  const wanted = new Map<string, Map<string, number>>();
  for (const state of states.values()) {
    const byMonth = new Map<string, number>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) byMonth.set(month, seq);
    wanted.set(state.key, byMonth);
  }

  const actions: TailAction[] = [];
  const covered = new Map<string, Set<string>>(); // planKey → meses já corretos no app

  for (const [month, rows] of existingByMonth) {
    if (month <= faturaMonth) continue; // o mês da fatura é tratado pelo replace
    for (const row of rows) {
      if (!row.installment) continue; // à vista: preserva
      const key = planKey(row, row.installment);
      const byMonth = wanted.get(key);
      if (!byMonth) continue; // plano que a fatura não conhece: preserva
      if (byMonth.get(month) === row.installment.seq) {
        const set = covered.get(key) ?? new Set<string>();
        set.add(month);
        covered.set(key, set);
        continue; // já está certo
      }
      actions.push({ kind: "delete", id: row.id });
    }
  }

  for (const state of states.values()) {
    const done = covered.get(state.key) ?? new Set<string>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) {
      if (done.has(month)) continue;
      actions.push({
        kind: "insert",
        month,
        description: tailDescription(state, seq),
        cents: state.cents,
        seq,
        count: state.count,
      });
    }
  }
  return actions;
}
