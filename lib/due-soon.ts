import { isOverdue } from "@/lib/calc";

/**
 * "O que eu preciso pagar agora" — a pergunta que o Dashboard não respondia.
 * Ele mostrava bem como o mês está, mas para saber o que vence esta semana era
 * preciso ir à tela do Mês e varrer a lista inteira.
 */

export type DueInput = {
  entryId: string;
  itemName: string;
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  /** Dia do vencimento no mês; sem ele não dá para dizer quando vence. */
  dueDay: number | null;
  /** Linha derivada (reserva do dia a dia): não é conta que se paga. */
  readOnlyHint: string | null;
};

export type DueRow = {
  entryId: string;
  itemName: string;
  cents: number;
  dueDay: number;
  overdue: boolean;
  /** Dias até o vencimento; 0 é hoje. Negativo em conta atrasada. */
  daysLeft: number;
};

/**
 * Despesas em aberto que vencem nos próximos `withinDays` dias, mais as
 * atrasadas — que entram sempre, por mais velhas que sejam.
 *
 * O atraso reusa `isOverdue` de lib/calc.ts, para o Dashboard e a tela do Mês
 * não discordarem sobre o que está atrasado.
 */
export function dueSoon(
  rows: DueInput[],
  month: string,
  todayISO: string,
  withinDays: number,
): DueRow[] {
  const todayMonth = todayISO.slice(0, 7);
  const today = Number(todayISO.slice(8, 10));

  const out: DueRow[] = [];
  for (const r of rows) {
    if (r.paid || r.categoryType === "INCOME" || r.readOnlyHint || r.dueDay === null) continue;
    const overdue = isOverdue({ paid: r.paid, categoryType: r.categoryType, dueDay: r.dueDay }, month, todayISO);
    const daysLeft = r.dueDay - today;
    // Fora do mês corrente, só o atraso interessa: o mês futuro ainda vai
    // aparecer no seu lugar, e comparar dias entre meses diferentes daria
    // "vence em -20 dias" para conta de outubro.
    if (!overdue && (month !== todayMonth || daysLeft < 0 || daysLeft > withinDays)) continue;
    out.push({
      entryId: r.entryId,
      itemName: r.itemName,
      cents: r.plannedCents,
      dueDay: r.dueDay,
      overdue,
      daysLeft,
    });
  }
  // Atrasadas primeiro; dentro de cada grupo, por dia de vencimento.
  return out.sort((a, b) => (a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : a.dueDay - b.dueDay));
}
