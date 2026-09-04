import { sumCents } from "@/lib/money";

export type EntryView = {
  itemName: string;
  categoryId: string;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  /**
   * Movimento entre bolsos seus (depósito/retirada de caixinha), não ganho nem
   * gasto. Fica FORA de todas as métricas daqui, menos `cashBalance` — ver a
   * nota sobre os dois saldos abaixo.
   */
  isTransfer?: boolean;
};

/**
 * Existem DOIS saldos, de propósito, e trocar um pelo outro reintroduz bugs
 * antigos:
 *
 *   `plannedBalance` — "sobrou ou faltou no mês". Ignora transferências:
 *     guardar R$ 16 mil na caixinha não é despesa, e o mês não fechou no
 *     vermelho por causa disso.
 *   `cashBalance` — "quanto entrou e saiu da conta". Conta as transferências,
 *     porque o depósito de fato sai da conta corrente. É o que o PATRIMÔNIO
 *     projetado acumula: ele já parte do total das caixinhas, então usar o
 *     saldo sem transferência contaria o dinheiro guardado duas vezes.
 */
const isTransfer = (x: EntryView) => x.isTransfer === true;
const income = (e: EntryView[]) => e.filter((x) => x.categoryType === "INCOME" && !isTransfer(x));
const expense = (e: EntryView[]) => e.filter((x) => x.categoryType === "EXPENSE" && !isTransfer(x));

/**
 * Quanto ficou guardado no mês: depósitos menos retiradas. Negativo no mês em
 * que se tirou mais da caixinha do que se pôs.
 */
export function savedInMonth(e: EntryView[]): number {
  const transfers = e.filter(isTransfer);
  const deposits = transfers.filter((x) => x.categoryType === "EXPENSE");
  const withdrawals = transfers.filter((x) => x.categoryType === "INCOME");
  return sumCents(deposits.map((x) => x.plannedCents)) - sumCents(withdrawals.map((x) => x.plannedCents));
}

/** Saldo do dinheiro na conta: o do mês menos o que foi para as caixinhas. */
export function cashBalance(e: EntryView[]): number {
  return plannedBalance(e) - savedInMonth(e);
}

export function plannedIncome(e: EntryView[]): number {
  return sumCents(income(e).map((x) => x.plannedCents));
}
export function plannedExpense(e: EntryView[]): number {
  return sumCents(expense(e).map((x) => x.plannedCents));
}
export function plannedBalance(e: EntryView[]): number {
  return plannedIncome(e) - plannedExpense(e);
}
/** Soma dos previstos de despesas ainda não pagas. */
export function remainingToPay(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => !x.paid).map((x) => x.plannedCents));
}
/** Soma dos previstos de despesas já pagas (complemento de remainingToPay). */
export function paidExpense(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/** Soma dos previstos de receitas já recebidas. */
export function receivedIncome(e: EntryView[]): number {
  return sumCents(income(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/**
 * Sobra REALIZADA do mês: o que de fato entrou menos o que de fato saiu.
 *
 * Não confundir com as duas métricas vizinhas:
 *   `plannedBalance` ignora a baixa — diria para guardar dinheiro que ainda não
 *     caiu na conta;
 *   o "saldo a realizar" do Panorama é o oposto — o que ainda FALTA acontecer.
 *
 * Usa `paidCents` quando a baixa registrou valor, caindo no previsto quando não.
 * `paidExpense`/`receivedIncome` acima somam sempre o PREVISTO das linhas pagas,
 * de propósito (progresso do mês); aqui o que vale é o valor efetivo.
 */
export function realizedBalance(e: EntryView[]): number {
  return settled(income(e)) - settled(expense(e));
}

const settled = (rows: EntryView[]) =>
  sumCents(rows.filter((x) => x.paid).map((x) => x.paidCents ?? x.plannedCents));

/**
 * Sobra realizada CONTANDO as transferências: o que ainda dá para guardar.
 *
 * É o número que alimenta a sugestão do depósito, e por isso não pode ser o
 * `realizedBalance`: quem já mandou a sobra para a caixinha veria o app
 * sugerindo guardar o mesmo dinheiro outra vez.
 */
export function realizedCashBalance(e: EntryView[]): number {
  const all = (type: "INCOME" | "EXPENSE") => e.filter((x) => x.categoryType === type);
  return settled(all("INCOME")) - settled(all("EXPENSE"));
}

/** Percentual inteiro 0–100 (clampado); total <= 0 → 0, sem divisão por zero. */
export function progressPct(paidCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((paidCents / totalCents) * 100)));
}
/**
 * Despesa não paga está atrasada quando o mês já passou, ou quando é o mês
 * corrente e o dia de vencimento ficou para trás. Receita, linha paga e mês
 * futuro nunca atrasam; sem dueDay, só o mês passado conta.
 * "YYYY-MM" compara lexicograficamente na ordem cronológica.
 */
export function isOverdue(
  row: { paid: boolean; categoryType: "INCOME" | "EXPENSE"; dueDay: number | null },
  month: string,
  todayISO: string,
): boolean {
  if (row.paid || row.categoryType === "INCOME") return false;
  const todayMonth = todayISO.slice(0, 7);
  if (month < todayMonth) return true;
  if (month > todayMonth) return false;
  return row.dueDay !== null && row.dueDay < Number(todayISO.slice(8, 10));
}
export function expenseRanking(e: EntryView[]): { itemName: string; cents: number }[] {
  return expense(e)
    .map((x) => ({ itemName: x.itemName, cents: x.plannedCents }))
    .sort((a, b) => b.cents - a.cents);
}
/** Agrega por ID (homônimas não se misturam); o nome é só o rótulo de exibição. */
export function expenseByCategory(e: EntryView[]): { categoryId: string; categoryName: string; cents: number }[] {
  const map = new Map<string, { categoryName: string; cents: number }>();
  for (const x of expense(e)) {
    const cur = map.get(x.categoryId);
    map.set(x.categoryId, {
      categoryName: cur?.categoryName ?? x.categoryName,
      cents: (cur?.cents ?? 0) + x.plannedCents,
    });
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.cents - a.cents);
}

export type CategoryGroup<T> = {
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  rows: T[];
  subtotalCents: number;
};

/**
 * Agrupa linhas por categoria e soma subtotais (em centavos).
 * Ordena: INCOME antes de EXPENSE; dentro do mesmo tipo, subtotal desc.
 * Não muta o array de entrada.
 */
export function groupByCategory<
  T extends { categoryName: string; categoryType: "INCOME" | "EXPENSE"; plannedCents: number },
>(rows: T[]): CategoryGroup<T>[] {
  const map = new Map<string, CategoryGroup<T>>();
  for (const row of rows) {
    const key = `${row.categoryType}:${row.categoryName}`;
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(key, {
        categoryName: row.categoryName,
        categoryType: row.categoryType,
        rows: [row],
        subtotalCents: 0,
      });
    }
  }
  const groups = [...map.values()].map((g) => ({
    ...g,
    subtotalCents: sumCents(g.rows.map((r) => r.plannedCents)),
  }));
  return groups.sort((a, b) => {
    if (a.categoryType !== b.categoryType) return a.categoryType === "INCOME" ? -1 : 1;
    return b.subtotalCents - a.subtotalCents;
  });
}
