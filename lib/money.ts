/** Converte um Decimal/valor numérico em centavos inteiros. */
export function decimalToCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) throw new Error(`Valor decimal inválido: ${value}`);
  return Math.round(n * 100);
}

/** Converte centavos inteiros para reais (número). */
export function centsToNumber(cents: number): number {
  return cents / 100;
}

/** Soma valores em centavos. */
export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Formata centavos como moeda BRL. Ex.: 138342 -> "R$ 1.383,42". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Só pontos de milhar: "1.299", "12.345.678". Sem vírgula, o ponto seguido de
 * exatamente três dígitos é separador de milhar em pt-BR, nunca decimal — dinheiro
 * não tem três casas. "54.9" e "1299.90" continuam sendo decimais com ponto.
 */
const THOUSANDS_ONLY_RE = /^-?\d{1,3}(?:\.\d{3})+$/;

/**
 * Normaliza um número escrito em pt-BR ou com ponto decimal para a forma que
 * `Number()` entende: "1.383,42" → "1383.42"; "1.299" → "1299"; "54.9" → "54.9".
 * Antes, "1.299" virava 1,299 e o bot lançava R$ 1,30 em vez de R$ 1.299,00.
 */
export function normalizeBRLNumber(cleaned: string): string {
  if (cleaned.includes(",")) return cleaned.replace(/\./g, "").replace(",", ".");
  if (THOUSANDS_ONLY_RE.test(cleaned)) return cleaned.replace(/\./g, "");
  return cleaned;
}

/** Faz parse de uma string BRL/decimal em centavos. Ex.: "1.383,42" -> 138342. */
export function parseBRLToCents(input: string): number {
  const cleaned = input.replace(/R\$/g, "").replace(/[\s ]/g, "").trim();
  if (cleaned === "") throw new Error("Valor monetário vazio");
  const n = Number(normalizeBRLNumber(cleaned));
  if (Number.isNaN(n)) throw new Error(`Valor monetário inválido: ${input}`);
  return Math.round(n * 100);
}
