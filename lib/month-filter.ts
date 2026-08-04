/** Normaliza para busca: minúsculas e sem acentos ("Crédito" → "credito"). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Linhas cujo nome contém a busca (sem acentos/caixa). Query vazia → tudo. */
export function filterViews<T extends { itemName: string }>(views: T[], query: string): T[] {
  const q = normalizeText(query.trim());
  if (q === "") return views;
  return views.filter((v) => normalizeText(v.itemName).includes(q));
}
