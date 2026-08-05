/**
 * Casamento entre o que o app tem no mês e o que a fatura cobrou.
 *
 * Duas dificuldades resolvidas aqui:
 *   1. O app grava parcela de dois jeitos — `installmentSeq/Count` nas colunas
 *      (bot/share, descrição sem marcador) ou marcador na descrição (importação
 *      de CSV/fatura, colunas nulas).
 *   2. As descrições divergem: a fatura prefixa "Antecipada - " na quitação
 *      antecipada e usa outro nome para o NuTag.
 */
import { normalizeDescription } from "@/lib/description-match";
import { FATURA_ALIASES } from "@/lib/fatura-aliases";

const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;
const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)$/;
const ANTECIPADA_PREFIX_RE = /^antecipada - /;

/** Descrição comparável entre app e fatura. */
export function canonicalFaturaDescription(description: string): string {
  const d = normalizeDescription(description).replace(ANTECIPADA_PREFIX_RE, "");
  for (const { pattern, canonical } of FATURA_ALIASES) {
    if (pattern.test(d)) return canonical;
  }
  return d;
}

/**
 * Parcela de uma linha, nas duas convenções. As COLUNAS ganham: quando existem,
 * são o dado explícito; o marcador é inferência sobre texto.
 */
export function readInstallment(row: {
  description: string;
  installmentSeq?: number | null;
  installmentCount?: number | null;
}): { seq: number; count: number } | null {
  if (row.installmentSeq != null && row.installmentCount != null) {
    return { seq: row.installmentSeq, count: row.installmentCount };
  }
  const nubank = NUBANK_MARKER_RE.exec(row.description);
  if (nubank) return { seq: Number(nubank[1]), count: Number(nubank[2]) };
  const bradesco = BRADESCO_MARKER_RE.exec(row.description);
  if (bradesco) return { seq: Number(bradesco[1]), count: Number(bradesco[2]) };
  return null;
}

/** Chave de casamento: descrição comparável + valor exato. */
export function matchKey(description: string, cents: number): string {
  return `${canonicalFaturaDescription(description)}|${cents}`;
}
