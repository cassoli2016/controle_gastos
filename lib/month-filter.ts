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
