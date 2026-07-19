/**
 * Identifica o cartão de uma fatura CSV pelo NOME DO ARQUIVO (fallback para
 * quando o cliente do Telegram não permite legenda no documento).
 */

export type CardNameRef = { id: string; name: string };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Cartões cujo nome (ou alguma palavra do nome com 3+ letras) aparece no nome
 * do arquivo. Comparação sem acentos e sem caixa: "fatura-itau.csv" casa
 * "Itaú Click". Retorna todos os que casam — mais de um = ambíguo.
 */
export function matchCardsByFileName<T extends CardNameRef>(fileName: string | undefined, cards: T[]): T[] {
  if (!fileName) return [];
  const file = normalize(fileName);
  return cards.filter((card) => {
    const name = normalize(card.name);
    if (file.includes(name)) return true;
    return name.split(/\s+/).some((word) => word.length >= 3 && file.includes(word));
  });
}
