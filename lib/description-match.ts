/** Comparação de descrições sem caixa/acentos (provisão × cobrança real). */
export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Iguais o suficiente": uma contém a outra ("Google YouTube Premium" × "YouTube Premium"). */
export function descriptionsMatch(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}
