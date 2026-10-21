import { normalizeDescription } from "@/lib/description-match";

export type ItemStatusFilter = "ativos" | "arquivados" | "todos";

/** `?status=` da URL; qualquer outra coisa cai no default "ativos". */
export function parseItemStatus(s: string | undefined): ItemStatusFilter {
  return s === "arquivados" || s === "todos" ? s : "ativos";
}

/** Filtro da lista de Itens: status + busca por nome sem caixa/acentos. */
export function filterItems<T extends { name: string; active: boolean }>(
  items: T[],
  q: string | undefined,
  status: ItemStatusFilter,
): T[] {
  const nq = q ? normalizeDescription(q) : "";
  return items.filter((i) => {
    if (status === "ativos" && !i.active) return false;
    if (status === "arquivados" && i.active) return false;
    return nq === "" || normalizeDescription(i.name).includes(nq);
  });
}

const FREQUENCY_NAMES: Record<number, string> = {
  1: "mensal",
  2: "bimestral",
  3: "trimestral",
  4: "quadrimestral",
  6: "semestral",
  12: "anual",
};

/** "mensal", "bimestral"… ou "a cada N meses" para cadências sem nome próprio. */
export function frequencyLabel(intervalMonths: number): string {
  return FREQUENCY_NAMES[intervalMonths] ?? `a cada ${intervalMonths} meses`;
}

/** Quando a conta vence: a regra de dia útil manda; senão o dia fixo; senão "—". */
export function dueLabel(dueDay: number | null, businessDay: number | null): string {
  if (businessDay !== null) return `${businessDay}º dia útil`;
  if (dueDay !== null) return `dia ${dueDay}`;
  return "—";
}
