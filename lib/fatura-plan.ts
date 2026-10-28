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
import { descriptionsMatch } from "@/lib/description-match";

export type PlanState = {
  key: string;
  /** Descrição de referência, usada ao gerar as linhas da cauda. */
  description: string;
  count: number;
  /** Valor por parcela. */
  cents: number;
  /** Última parcela que o banco cobrou. */
  chargedThrough: number;
  /**
   * Parcelas que ESTA fatura cobrou deste plano. É o que separa planos gêmeos:
   * o banco não cobra a mesma parcela duas vezes num ciclo, então duas linhas
   * iguais com a mesma parcela são duas compras (dois carros, o mesmo serviço).
   */
  seqs: Set<number>;
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
  return `${planBase(description)}|${count}`;
}

/** Nome da loja sem o marcador de parcela — a parte do balde que vem da descrição. */
function planBase(description: string): string {
  return canonicalFaturaDescription(description)
    .replace(/ - parcela \d+\/\d+$/, "")
    .replace(/\(\d{2}\/\d{2}\)$/, "")
    .trim();
}

/**
 * Planos de OUTRO balde com nome aparentado: um nome contém o outro, mesmo nº de
 * parcelas e valor dentro da tolerância, do mais próximo ao mais distante.
 *
 * O aviso do banco grava o nome curto ("AMAZON BR") e a fatura o nome com cidade
 * ("AMAZON BR SAO PAULO"). Os baldes não se encontram, e sem este parentesco a
 * cauda lançada pelo aviso era tratada como plano que a fatura não conhece —
 * preservada ao lado da cauda da fatura. Medido: R$ 1.142,34 em dez/2026..ago/2027.
 * Quem chama exige ainda a MESMA parcela no mesmo mês, o que mantém separada a
 * compra nova de nome curto (ela está sempre numa parcela anterior à do plano).
 */
function findSiblingPlans(
  index: PlanIndex,
  row: { description: string; cents: number },
  installment: { count: number },
): PlanState[] {
  const base = planBase(row.description);
  const own = planBucket(row.description, installment.count);
  return [...index.entries()]
    .filter(([bucket]) => bucket !== own)
    .flatMap(([, plans]) => plans)
    .filter((s) => s.count === installment.count && descriptionsMatch(planBase(s.description), base))
    .map((state) => ({ state, diff: Math.abs(state.cents - row.cents) }))
    .filter((c) => c.diff <= CENTS_TOLERANCE)
    .sort((a, b) => a.diff - b.diff)
    .map((c) => c.state);
}

/** Os planos do balde cujo valor por parcela casa dentro da tolerância, do mais próximo ao mais distante. */
export function findPlans(
  index: PlanIndex,
  row: { description: string; cents: number },
  installment: { count: number },
): PlanState[] {
  const bucket = index.get(planBucket(row.description, installment.count));
  if (!bucket) return [];
  return bucket
    .map((state) => ({ state, diff: Math.abs(state.cents - row.cents) }))
    .filter((c) => c.diff <= CENTS_TOLERANCE)
    .sort((a, b) => a.diff - b.diff)
    .map((c) => c.state);
}

/** O plano do balde cujo valor por parcela casa dentro da tolerância (e passa em `accept`). */
export function findPlan(
  index: PlanIndex,
  row: { description: string; cents: number },
  installment: { count: number },
  accept: (state: PlanState) => boolean = () => true,
): PlanState | null {
  return findPlans(index, row, installment).find(accept) ?? null;
}

function upsertState(index: PlanIndex, state: PlanState): void {
  const bucketKey = planBucket(state.description, state.count);
  const bucket = index.get(bucketKey) ?? [];
  // Gêmeo (mesma loja, mesmo nº de parcelas, mesmo valor) ganha sufixo na
  // chave: `reconcileTail` indexa a cauda por chave, e dois planos com a mesma
  // chave viravam um só — a cauda do segundo carro nunca era gerada.
  const twins = bucket.filter((s) => s.cents === state.cents).length;
  index.set(bucketKey, [...bucket, twins > 0 ? { ...state, key: `${state.key}#${twins + 1}` } : state]);
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
    const { seq, count } = line.installment;
    // O plano que ainda não cobrou esta parcela nesta fatura. A quitação
    // antecipada traz 3/10, 4/10… do MESMO plano (parcelas diferentes); duas
    // linhas 1/6 iguais são planos gêmeos (a mesma parcela, duas compras).
    const existing = findPlan(index, line, line.installment, (s) => !s.seqs.has(seq));
    if (existing) {
      existing.chargedThrough = Math.max(existing.chargedThrough, seq);
      existing.seqs.add(seq);
      continue;
    }
    const description = line.description.replace(/^Antecipada - /, "");
    upsertState(index, {
      key: `${planBucket(description, count)}|${line.cents}`,
      description,
      count,
      cents: line.cents,
      chargedThrough: seq,
      seqs: new Set([seq]),
    });
  }
  for (const orphan of orphans) {
    if (!orphan.installment) continue; // à vista não é plano
    if (findPlan(index, orphan, orphan.installment)) continue; // a fatura já disse; ela ganha
    // A mesma parcela já cobrada com o nome aparentado (com/sem cidade): é a
    // linha repetida, não parcela atrasada — não pode deslocar o plano.
    const seq = orphan.installment.seq;
    if (findSiblingPlans(index, orphan, orphan.installment).some((s) => s.chargedThrough >= seq)) continue;
    upsertState(index, {
      key: `${planBucket(orphan.description, orphan.installment.count)}|${orphan.cents}`,
      description: orphan.description,
      count: orphan.installment.count,
      cents: orphan.cents,
      chargedThrough: orphan.installment.seq - 1,
      seqs: new Set(),
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

  const cover = (key: string, month: string) => {
    const set = covered.get(key) ?? new Set<string>();
    set.add(month);
    covered.set(key, set);
  };

  for (const [month, rows] of existingByMonth) {
    if (month <= faturaMonth) continue; // o mês da fatura é tratado pelo replace
    const unknown: (AppRow & { installment: { seq: number; count: number } })[] = [];
    for (const row of rows) {
      if (!row.installment) continue; // à vista: preserva
      const candidates = findPlans(states, row, row.installment);
      if (candidates.length === 0) {
        unknown.push({ ...row, installment: row.installment });
        continue;
      }
      const seq = row.installment.seq;
      // Cada linha do app cobre UM plano. Com gêmeos, a primeira linha cobre o
      // primeiro e a segunda cobre o segundo; uma terceira não tem plano que a
      // queira neste mês e sai — é a mesma régua de "parcela fora da cauda".
      const free = candidates.find(
        (p) => wanted.get(p.key)?.get(month) === seq && !covered.get(p.key)?.has(month),
      );
      if (free) {
        cover(free.key, month);
        continue; // já está certo
      }
      actions.push({ kind: "delete", id: row.id });
    }
    // Depois das linhas com o nome da fatura, para elas terem a preferência: a
    // linha de nome aparentado (cauda do aviso) só cobre o plano se ninguém
    // cobriu, e sai se o plano já está coberto.
    for (const row of unknown) {
      const seq = row.installment.seq;
      const siblings = findSiblingPlans(states, row, row.installment).filter(
        (p) => wanted.get(p.key)?.get(month) === seq,
      );
      if (siblings.length === 0) continue; // plano que a fatura não conhece: preserva
      const free = siblings.find((p) => !covered.get(p.key)?.has(month));
      if (free) cover(free.key, month);
      else actions.push({ kind: "delete", id: row.id });
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
