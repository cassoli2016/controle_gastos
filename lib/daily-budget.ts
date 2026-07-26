/**
 * Reserva do dia a dia: o mês reserva um valor por dia (R$ 100/dia = R$ 3.100
 * num mês de 31 dias) e o que resta cai a cada dia que passa.
 *
 * É uma META de gasto variável (mercado, combustível, lanches), não uma
 * despesa: os gastos reais entram pela fatura do cartão, então este valor
 * nunca soma no saldo do mês — somar contaria o mesmo dinheiro duas vezes.
 */

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
