import { daysInMonth } from "@/lib/daily-budget";
import { formatCents } from "@/lib/money";

/** Subconjunto de DisplayRow que o fluxo diário precisa (estruturalmente compatível). */
export type CashflowRow = {
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidDate: Date | null;
  dueDay: number | null;
  purchaseDate: Date | null;
};

export type CashflowDay = { day: number; inCents: number; outCents: number; cumulativeCents: number };

/** Trecho CONTÍGUO de dias com acumulado negativo (`from` e `to` iguais = um dia só). */
export type NegativeRange = { from: number; to: number };

/**
 * Veredito do mês. O mínimo aparece nos DOIS casos: quando o mês é positivo
 * ele é o "menor saldo", e é o que permite o card ter sempre uma frase-resumo
 * (alternativa textual do gráfico para leitor de tela).
 */
export type CashflowVerdict =
  | { alwaysPositive: true; minCents: number; minDay: number }
  | { alwaysPositive: false; negativeRanges: NegativeRange[]; minCents: number; minDay: number };

export type Cashflow = { days: CashflowDay[]; verdict: CashflowVerdict };

/** Dia (1..total) em que a linha conta no fluxo do mês. */
function flowDay(row: CashflowRow, month: string, total: number): number {
  const clamp = (d: number) => Math.min(Math.max(d, 1), total);
  if (row.paid && row.paidDate) {
    const paidMonth = row.paidDate.toISOString().slice(0, 7);
    // Pago fora do mês de competência encosta na borda (antes → dia 1; depois → último).
    if (paidMonth < month) return 1;
    if (paidMonth > month) return total;
    return clamp(row.paidDate.getUTCDate());
  }
  if (row.dueDay !== null) return clamp(row.dueDay);
  if (row.purchaseDate) return clamp(row.purchaseDate.getUTCDate());
  // Sem data: pessimista — a despesa cobra logo, a receita só entra no fim.
  return row.categoryType === "EXPENSE" ? 1 : total;
}

/**
 * Saldo acumulado dia a dia do mês, partindo de zero.
 *
 * VALOR: sempre o PREVISTO (`plannedCents`), pago ou não — o mesmo valor que os
 * stat cards do topo somam. Usar `paidCents` na linha paga contaria dinheiro
 * duas vezes: quando a cobrança real de uma assinatura/renovação chega na
 * fatura, o app abate o previsto da linha provisionada e marca `paid` com
 * `paidAmount` = cobrança (`consumeSubscriptionCharge`, `consumeRenewalCharge`),
 * porque aquele dinheiro passou a viver dentro do consolidado do cartão — que
 * já é outra linha do mês. Com o previsto, vale a invariante: o acumulado do
 * último dia reconcilia com receitas − despesas dos stat cards.
 *
 * DATA: híbrida — linha paga entra na data real (`paidDate`), linha em aberto
 * entra na data prevista. É o "quando" que muda com o pagamento, não o quanto.
 *
 * `budget` é a reserva do dia a dia (perDayCents nos dias cobertos), passada à
 * parte para não duplicar com a linha derivada da lista.
 */
export function dailyCashflow(
  rows: CashflowRow[],
  month: string,
  todayISO: string,
  budget: { perDayCents: number } | null,
): Cashflow {
  const total = daysInMonth(month);
  const inByDay: number[] = new Array(total + 1).fill(0);
  const outByDay: number[] = new Array(total + 1).fill(0);

  for (const row of rows) {
    const day = flowDay(row, month, total);
    if (row.categoryType === "INCOME") inByDay[day] += row.plannedCents;
    else outByDay[day] += row.plannedCents;
  }

  if (budget) {
    const todayMonth = todayISO.slice(0, 7);
    const start = month > todayMonth ? 1 : month < todayMonth ? total + 1 : Number(todayISO.slice(8, 10));
    for (let d = start; d <= total; d++) outByDay[d] += budget.perDayCents;
  }

  const days: CashflowDay[] = [];
  let cumulative = 0;
  for (let d = 1; d <= total; d++) {
    cumulative += inByDay[d] - outByDay[d];
    days.push({ day: d, inCents: inByDay[d], outCents: outByDay[d], cumulativeCents: cumulative });
  }

  // Trechos CONTÍGUOS: um mês pode alternar (negativo → positivo → negativo), e
  // dizer "do primeiro ao último dia negativo" seria mentira nesses casos.
  const negativeRanges: NegativeRange[] = [];
  for (const d of days) {
    if (d.cumulativeCents >= 0) continue;
    const last = negativeRanges[negativeRanges.length - 1];
    if (last && last.to === d.day - 1) last.to = d.day;
    else negativeRanges.push({ from: d.day, to: d.day });
  }

  const min = days.reduce((a, b) => (b.cumulativeCents < a.cumulativeCents ? b : a));
  const verdict: CashflowVerdict =
    negativeRanges.length === 0
      ? { alwaysPositive: true, minCents: min.cumulativeCents, minDay: min.day }
      : { alwaysPositive: false, negativeRanges, minCents: min.cumulativeCents, minDay: min.day };
  return { days, verdict };
}

/** "1 a 4" (trecho) ou "20" (dia solto). */
function rangeText(r: NegativeRange): string {
  return r.from === r.to ? `${r.from}` : `${r.from} a ${r.to}`;
}

/**
 * Frase-resumo do mês, sempre presente no card expandido — é também a
 * alternativa textual do gráfico para quem usa leitor de tela.
 */
export function verdictSentence(verdict: CashflowVerdict): string {
  if (verdict.alwaysPositive) {
    return `Positivo o mês todo; menor saldo: ${formatCents(verdict.minCents)} no dia ${verdict.minDay}.`;
  }
  const pior = `; pior momento: ${formatCents(verdict.minCents)} no dia ${verdict.minDay}.`;
  const ranges = verdict.negativeRanges;
  if (ranges.length === 1) {
    const r = ranges[0];
    return r.from === r.to ? `Fica negativo no dia ${r.from}${pior}` : `Fica negativo do dia ${r.from} ao dia ${r.to}${pior}`;
  }
  const trechos = ranges.map(rangeText);
  const lista = `${trechos.slice(0, -1).join(", ")} e ${trechos[trechos.length - 1]}`;
  return `Fica negativo em ${ranges.length} trechos: dias ${lista}${pior}`;
}

/**
 * Parâmetros do desenho da curva: `zeroOffset` é onde o zero cai no gradiente
 * (verde acima, vermelho abaixo) e `flat` avisa que todos os dias têm o mesmo
 * acumulado — aí o path do traço fica com bounding box de altura zero e um
 * gradiente em `objectBoundingBox` não renderiza, então quem desenha precisa
 * cair para cor sólida ou a linha some.
 */
export function cashflowGradient(values: number[]): { zeroOffset: number; flat: boolean } {
  if (values.length === 0) return { zeroOffset: 1, flat: true };
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  const max = Math.max(dataMax, 0);
  const min = Math.min(dataMin, 0);
  return { zeroOffset: max === min ? 1 : max / (max - min), flat: dataMax === dataMin };
}
