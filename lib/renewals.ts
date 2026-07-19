/** Alertas de renovação anual de contas (seguro, anuidade…). */

export type RenewalItem = { name: string; renewalMonth: number };

export type UpcomingRenewal = {
  name: string;
  renewalMonth: number;
  /** 0 = renova no mês corrente, 1 = mês que vem, … */
  monthsAway: number;
};

/**
 * Renovações nos próximos `horizon` meses (mês corrente incluso), ordenadas
 * da mais próxima para a mais distante.
 */
export function upcomingRenewals(
  items: RenewalItem[],
  currentMonth: number, // 1-12
  horizon: number = 3,
): UpcomingRenewal[] {
  return items
    .map((i) => ({
      name: i.name,
      renewalMonth: i.renewalMonth,
      monthsAway: (i.renewalMonth - currentMonth + 12) % 12,
    }))
    .filter((i) => i.monthsAway < horizon)
    .sort((a, b) => a.monthsAway - b.monthsAway || a.name.localeCompare(b.name));
}

export const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function renewalLabel(r: UpcomingRenewal): string {
  if (r.monthsAway === 0) return "renova ESTE mês";
  if (r.monthsAway === 1) return "renova mês que vem";
  return `renova em ${MONTH_NAMES[r.renewalMonth - 1]}`;
}
