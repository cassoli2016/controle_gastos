import { daysInMonth } from "@/lib/daily-budget";
import { shiftMonth } from "@/lib/month-nav";
import { SPEND_GROUPS, spendGroupOf, type SpendGroupId } from "@/lib/spend-groups";

/**
 * Gasto à vista no cartão por grupo, pela DATA DA COMPRA: o mês corrente até
 * hoje contra a média dos três meses-calendário anteriores.
 *
 * Por data da compra, e não por fatura, de propósito: a pergunta é "quanto
 * estou gastando agora?", e a fatura mistura o fim de um mês com o começo do
 * outro (o Nubank fecha dia 27). A tendência das reservas continua medindo por
 * ciclo fechado (lib/trend.ts) — lá o que importa é o que já foi cobrado.
 *
 * Só entra o que `countsAsVariableSpend` aceita (à vista, positiva, sem linha
 * fixa no Mês): é o mesmo número que a tendência projeta, aberto por grupo.
 *
 * Puro — quem lê o banco é `getCardSpend` em lib/planning.ts.
 */
export type SpendTx = { dateISO: string; cents: number; description: string };

export type GroupSpend = {
  id: SpendGroupId;
  label: string;
  color: string;
  /** Mês corrente até hoje. */
  currentCents: number;
  /** Média por mês dos três meses anteriores. */
  averageCents: number;
  /** Maiores estabelecimentos do mês corrente (ou da média, se o mês está vazio). */
  top: { name: string; cents: number }[];
};

export type CardSpend = {
  month: string;
  daysElapsed: number;
  currentCents: number;
  currentPerDayCents: number;
  /** Meses da média, em ordem ("2026-08", "2026-09", "2026-10"). */
  previousMonths: string[];
  averageCents: number;
  averagePerDayCents: number;
  /** Data da compra mais recente registrada: o retrato vale até ela. */
  lastPurchaseISO: string | null;
  groups: GroupSpend[];
};

const TOP_N = 3;

function topMerchants(txs: SpendTx[]): { name: string; cents: number }[] {
  const by = new Map<string, number>();
  for (const t of txs) by.set(t.description, (by.get(t.description) ?? 0) + t.cents);
  return [...by]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([name, cents]) => ({ name, cents }));
}

export function cardSpend(txs: SpendTx[], todayISO: string): CardSpend {
  const month = todayISO.slice(0, 7);
  const daysElapsed = Number(todayISO.slice(8, 10));
  const previousMonths = [3, 2, 1].map((d) => shiftMonth(month, -d));
  const previousDays = previousMonths.reduce((a, m) => a + daysInMonth(m), 0);

  const current = txs.filter((t) => t.dateISO.slice(0, 7) === month && t.dateISO <= todayISO);
  const previous = txs.filter((t) => previousMonths.includes(t.dateISO.slice(0, 7)));
  const sum = (l: SpendTx[]) => l.reduce((a, t) => a + t.cents, 0);

  const groups = SPEND_GROUPS.map((g) => {
    const cur = current.filter((t) => spendGroupOf(t.description) === g.id);
    const prev = previous.filter((t) => spendGroupOf(t.description) === g.id);
    return {
      id: g.id,
      label: g.label,
      color: g.color,
      currentCents: sum(cur),
      averageCents: Math.round(sum(prev) / previousMonths.length),
      top: topMerchants(cur.length > 0 ? cur : prev),
    };
  })
    .filter((g) => g.currentCents > 0 || g.averageCents > 0)
    .sort((a, b) => b.currentCents - a.currentCents || b.averageCents - a.averageCents);

  const currentCents = sum(current);
  const previousCents = sum(previous);
  const dates = txs.map((t) => t.dateISO).filter((d) => d <= todayISO).sort();
  return {
    month,
    daysElapsed,
    currentCents,
    currentPerDayCents: daysElapsed > 0 ? Math.round(currentCents / daysElapsed) : 0,
    previousMonths,
    averageCents: Math.round(previousCents / previousMonths.length),
    averagePerDayCents: Math.round(previousCents / previousDays),
    lastPurchaseISO: dates.length > 0 ? dates[dates.length - 1] : null,
    groups,
  };
}
