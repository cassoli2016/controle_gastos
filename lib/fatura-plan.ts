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
import { CENTS_TOLERANCE, type FaturaBank, type FaturaLine } from "@/lib/fatura-core";
import { canonicalFaturaDescription, type AppRow } from "@/lib/fatura-match";

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

/** Balde → planos daquele grupo. Ver `planBucket` e `findPlan`. */
export type PlanIndex = Map<string, PlanState[]>;

/**
 * Balde do plano: loja + nº de parcelas, SEM o valor.
 *
 * O valor fica fora da chave porque o arredondamento do banco o faz variar entre
 * parcelas — com ele na chave, 2 centavos quebram a identidade e a parcela é
 * inserida em duplicidade. Dentro do balde, `findPlan` separa por valor com
 * tolerância, o que preserva a distinção entre dois planos da mesma loja e mesmo
 * tamanho (há duas Privalia 5x, de R$ 116,11 e R$ 138,39).
 */
function planBucket(description: string, count: number): string {
  const base = canonicalFaturaDescription(description)
    .replace(/ - parcela \d+\/\d+$/, "")
    .replace(/\(\d{2}\/\d{2}\)$/, "")
    .trim();
  return `${base}|${count}`;
}

/** O plano do balde cujo valor por parcela casa dentro da tolerância. */
export function findPlan(
  index: PlanIndex,
  row: { description: string; cents: number },
  installment: { count: number },
): PlanState | null {
  const bucket = index.get(planBucket(row.description, installment.count));
  if (!bucket) return null;
  let best: PlanState | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const state of bucket) {
    const diff = Math.abs(state.cents - row.cents);
    if (diff <= CENTS_TOLERANCE && diff < bestDiff) {
      best = state;
      bestDiff = diff;
    }
  }
  return best;
}

function upsertState(index: PlanIndex, state: PlanState): void {
  const bucketKey = planBucket(state.description, state.count);
  const bucket = index.get(bucketKey) ?? [];
  index.set(bucketKey, [...bucket, state]);
}

/**
 * Estado de cada plano. A FATURA manda: `chargedThrough` é a maior parcela que
 * ela cobrou. Plano que só aparece nas órfãs (o app esperava a parcela e o banco
 * não cobrou) entra como cobrado até a ANTERIOR — é o que produz o deslocamento.
 */
export function faturaPlanStates(lines: FaturaLine[], orphans: AppRow[]): PlanIndex {
  const index: PlanIndex = new Map();
  for (const line of lines) {
    if (line.kind !== "purchase" || !line.installment) continue;
    const existing = findPlan(index, line, line.installment);
    if (existing) {
      existing.chargedThrough = Math.max(existing.chargedThrough, line.installment.seq);
      continue;
    }
    const description = line.description.replace(/^Antecipada - /, "");
    upsertState(index, {
      key: `${planBucket(description, line.installment.count)}|${line.cents}`,
      description,
      count: line.installment.count,
      cents: line.cents,
      chargedThrough: line.installment.seq,
    });
  }
  for (const orphan of orphans) {
    if (!orphan.installment) continue; // à vista não é plano
    if (findPlan(index, orphan, orphan.installment)) continue; // a fatura já disse; ela ganha
    upsertState(index, {
      key: `${planBucket(orphan.description, orphan.installment.count)}|${orphan.cents}`,
      description: orphan.description,
      count: orphan.installment.count,
      cents: orphan.cents,
      chargedThrough: orphan.installment.seq - 1,
    });
  }
  return index;
}

/** Todos os planos, sem os baldes. */
export function allPlans(index: PlanIndex): PlanState[] {
  return [...index.values()].flat();
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

/**
 * Descrição da parcela `seq`, no marcador de cada banco: Bradesco escreve
 * "(10/12)" colado, Nubank " - Parcela 10/12". Só cosmético para o casamento
 * (o balde tira os dois), mas a linha aparece na tela do Mês.
 */
function tailDescription(state: PlanState, seq: number, bank: FaturaBank): string {
  const base = state.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, "");
  if (bank === "bradesco") {
    return `${base}(${String(seq).padStart(2, "0")}/${String(state.count).padStart(2, "0")})`;
  }
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
  states: PlanIndex;
  faturaMonth: string;
  existingByMonth: Map<string, AppRow[]>;
  /** Formato do marcador de parcela nas descrições geradas. */
  bank: FaturaBank;
}): TailAction[] {
  const { states, faturaMonth, existingByMonth, bank } = opts;
  const plans = allPlans(states);

  // Onde cada plano DEVE ter parcela: key do plano → mês → seq.
  const wanted = new Map<string, Map<string, number>>();
  for (const state of plans) {
    const byMonth = new Map<string, number>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) byMonth.set(month, seq);
    wanted.set(state.key, byMonth);
  }

  const actions: TailAction[] = [];
  const covered = new Map<string, Set<string>>(); // key do plano → meses já corretos no app

  for (const [month, rows] of existingByMonth) {
    if (month <= faturaMonth) continue; // o mês da fatura é tratado pelo replace
    for (const row of rows) {
      if (!row.installment) continue; // à vista: preserva
      const plan = findPlan(states, row, row.installment);
      if (!plan) continue; // plano que a fatura não conhece: preserva
      if (wanted.get(plan.key)?.get(month) === row.installment.seq) {
        const set = covered.get(plan.key) ?? new Set<string>();
        set.add(month);
        covered.set(plan.key, set);
        continue; // já está certo
      }
      actions.push({ kind: "delete", id: row.id });
    }
  }

  for (const state of plans) {
    const done = covered.get(state.key) ?? new Set<string>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) {
      if (done.has(month)) continue;
      actions.push({
        kind: "insert",
        month,
        description: tailDescription(state, seq, bank),
        cents: state.cents,
        seq,
        count: state.count,
      });
    }
  }
  return actions;
}
