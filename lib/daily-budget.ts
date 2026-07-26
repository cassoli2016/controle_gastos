/**
 * Reserva do dia a dia: o mês reserva um valor por dia (R$ 100/dia = R$ 3.100
 * num mês de 31 dias) e o que resta cai a cada dia que passa.
 *
 * O que resta é DESPESA do mês: entra como linha derivada na tela Mês e no
 * Panorama e pesa em todos os totais. Não conta o mesmo dinheiro duas vezes
 * junto com a fatura do cartão porque só o RESTANTE entra — os dias já vividos
 * saem daqui no mesmo ritmo em que aparecem na fatura, então os dois nunca
 * contam o mesmo dia.
 */

import { formatCents } from "@/lib/money";

export type DailyBudgetView = {
  perDayCents: number;
  daysInMonth: number;
  /** Dias que ainda podem ser gastos, incluindo hoje. */
  daysRemaining: number;
  /** `perDayCents × daysInMonth`. */
  monthTotalCents: number;
  /** `perDayCents × daysRemaining`. */
  remainingCents: number;
};

/** Dias do mês "YYYY-MM" (28/29/30/31). Dia 0 do mês seguinte = último deste. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Reserva do mês `month` vista em `todayISO`. Mês futuro está intocado; mês
 * passado não deixa nada; no mês corrente HOJE ainda conta, porque o dia de
 * hoje pode ser gasto — é o que faz o dia 1 de um mês de 31 dias valer o mês
 * cheio.
 */
export function dailyBudget(month: string, todayISO: string, perDayCents: number): DailyBudgetView {
  const total = daysInMonth(month);
  const todayMonth = todayISO.slice(0, 7);
  // "YYYY-MM" compara lexicograficamente na ordem cronológica.
  const daysRemaining =
    month > todayMonth
      ? total
      : month < todayMonth
        ? 0
        : Math.max(0, total - Number(todayISO.slice(8, 10)) + 1);
  return {
    perDayCents,
    daysInMonth: total,
    daysRemaining,
    monthTotalCents: perDayCents * total,
    remainingCents: perDayCents * daysRemaining,
  };
}

/** Nome da linha e da categoria da reserva na visão mensal. */
export const DAILY_BUDGET_LINE = "Reserva do dia a dia";

/**
 * Chave estável da linha derivada (usada como `key` de React e como sufixo de
 * id na matriz). NÃO é id de banco — não existe `MonthlyEntry` por trás.
 */
export const DAILY_BUDGET_ENTRY_ID = "daily-budget";

/**
 * Linha derivada da reserva num mês. Não existe no banco: é calculada do
 * calendário, e é isso que permite ela cair sozinha a cada dia — uma linha
 * gravada precisaria de um job diário e ficaria errada no dia em que ele não
 * rodasse. Não é paga, editada nem excluída.
 */
export type DailyBudgetLine = {
  line: string;
  categoryName: string;
  categoryType: "EXPENSE";
  /** `perDayCents × daysRemaining`: mês cheio no futuro, decaindo no corrente, 0 no passado. */
  cents: number;
  daysRemaining: number;
  daysInMonth: number;
  perDayCents: number;
  /** "6 de 31 dias · R$ 100,00/dia" — explica de onde vem o valor. */
  hint: string;
};

export function dailyBudgetLine(month: string, todayISO: string, perDayCents: number): DailyBudgetLine {
  const v = dailyBudget(month, todayISO, perDayCents);
  return {
    line: DAILY_BUDGET_LINE,
    categoryName: DAILY_BUDGET_LINE,
    categoryType: "EXPENSE",
    cents: v.remainingCents,
    daysRemaining: v.daysRemaining,
    daysInMonth: v.daysInMonth,
    perDayCents: v.perDayCents,
    hint: `${v.daysRemaining} de ${v.daysInMonth} dias · ${formatCents(v.perDayCents)}/dia`,
  };
}
