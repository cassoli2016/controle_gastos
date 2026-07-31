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
