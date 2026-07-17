/** Converte um Decimal/valor numérico em centavos inteiros. */
export function decimalToCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
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

/** Faz parse de uma string BRL/decimal em centavos. Ex.: "1.383,42" -> 138342. */
export function parseBRLToCents(input: string): number {
  const cleaned = input.replace(/R\$/g, "").replace(/[\s ]/g, "").trim();
  if (cleaned === "") throw new Error("Valor monetário vazio");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  if (Number.isNaN(n)) throw new Error(`Valor monetário inválido: ${input}`);
  return Math.round(n * 100);
}
