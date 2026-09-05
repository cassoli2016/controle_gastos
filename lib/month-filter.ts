import { normalizeText } from "@/lib/text";

/** Linhas cujo nome contém a busca (sem acentos/caixa). Query vazia → tudo. */
export function filterViews<T extends { itemName: string }>(views: T[], query: string): T[] {
  const q = normalizeText(query.trim());
  if (q === "") return views;
  return views.filter((v) => normalizeText(v.itemName).includes(q));
}

/**
 * `?pagas=` da URL: só "0" esconde as pagas. Ausente ou qualquer outra coisa
 * mostra tudo — o comportamento padrão da tela continua sendo mostrar.
 */
export function parseHidePaid(param: string | undefined): boolean {
  return param === "0";
}

/**
 * Linhas visíveis quando as pagas estão escondidas.
 *
 * Linha derivada (`readOnlyHint`, a reserva do dia a dia) nunca é paga e nunca
 * some: ela não é uma conta que você quitou, é um cálculo do calendário.
 *
 * Filtra só a EXIBIÇÃO. Subtotal da categoria e o contador "3/5 pagos" seguem
 * vindo do conjunto inteiro — esconder linha não pode mudar quanto o mês custa.
 */
export function visibleRows<T extends { paid: boolean; readOnlyHint?: unknown }>(rows: T[], hidePaid: boolean): T[] {
  if (!hidePaid) return rows;
  return rows.filter((r) => !r.paid || Boolean(r.readOnlyHint));
}

/**
 * Grupos que sobram quando as pagas estão escondidas: some o grupo que não
 * tem mais nenhuma linha para mostrar.
 *
 * Sem isso o cabeçalho ficava sozinho ocupando espaço — "Retirada da reserva
 * 2/2 recebidos" com nada embaixo. Usa `visibleRows` para o critério ser um
 * só: se a linha sobrevive ao filtro, o grupo dela também.
 */
export function visibleGroups<T extends { paid: boolean; readOnlyHint?: unknown }, G extends { rows: T[] }>(
  groups: G[],
  hidePaid: boolean,
): G[] {
  return groups.filter((g) => visibleRows(g.rows, hidePaid).length > 0);
}
