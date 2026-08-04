/** Normalização de texto compartilhada (busca e matching). */

/** Remove acentos preservando a caixa ("Água" → "Agua"). */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Minúsculas e sem acentos ("Crédito" → "credito"). */
export function normalizeText(s: string): string {
  return stripDiacritics(s.toLowerCase());
}
