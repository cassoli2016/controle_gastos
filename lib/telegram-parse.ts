export type ParsedExpense = {
  description: string;
  amountReais: number;
  installments: number;
  /** Palavras após o valor que não são "Nx" — usadas para casar o cartão pelo nome. */
  cardHint: string | null;
};

const AMOUNT_RE = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/;
const INSTALLMENTS_RE = /^(\d{1,3})x$/i;

function parseAmount(token: string): number {
  // "1.299,90" (pt-BR) ou "512.30"/"300" (decimal com ponto)
  const normalized = token.includes(",") ? token.replace(/\./g, "").replace(",", ".") : token;
  return Number(normalized);
}

/**
 * Interpreta mensagens do tipo "almoço 42,50 nubank 3x":
 * descrição (antes do valor) + valor + [cartão] + [Nx], em qualquer ordem
 * depois do valor. Retorna null se não houver descrição ou valor válido.
 */
export function parseExpenseMessage(text: string): ParsedExpense | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  // O valor é o PRIMEIRO token numérico (a descrição vem antes dele).
  const amountIdx = tokens.findIndex((t) => AMOUNT_RE.test(t));
  if (amountIdx <= 0) return null; // sem valor, ou sem descrição antes dele

  const amountReais = parseAmount(tokens[amountIdx]);
  if (!Number.isFinite(amountReais) || amountReais <= 0) return null;

  const description = tokens.slice(0, amountIdx).join(" ");

  let installments = 1;
  const cardWords: string[] = [];
  for (const t of tokens.slice(amountIdx + 1)) {
    const m = INSTALLMENTS_RE.exec(t);
    if (m) installments = Math.max(1, parseInt(m[1], 10));
    else cardWords.push(t);
  }

  return {
    description,
    amountReais,
    installments,
    cardHint: cardWords.length > 0 ? cardWords.join(" ").toLowerCase() : null,
  };
}
