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
import type { FaturaLine } from "@/lib/fatura-core";

const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;
const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)$/;
const ANTECIPADA_PREFIX_RE = /^antecipada - /;

const NORMALIZED_MARKER_RE = / - parcela \d+\/\d+$/;

/**
 * Descrição comparável entre app e fatura.
 *
 * O apelido é aplicado só à parte do ESTABELECIMENTO: o sufixo de parcela é
 * separado antes e recolocado depois. Sem isso o apelido engoliria o " - parcela
 * n/n", e duas parcelas diferentes do mesmo plano com o mesmo valor virariam a
 * mesma chave em `matchKey` — a detecção de órfãs passaria a casar a parcela 1
 * com a 3.
 */
export function canonicalFaturaDescription(description: string): string {
  const d = normalizeDescription(description).replace(ANTECIPADA_PREFIX_RE, "");
  const marker = NORMALIZED_MARKER_RE.exec(d);
  const suffix = marker ? marker[0] : "";
  const base = suffix ? d.slice(0, -suffix.length) : d;
  for (const { pattern, canonical } of FATURA_ALIASES) {
    if (pattern.test(base)) return canonical + suffix;
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

export type AppRow = {
  id: string;
  description: string;
  cents: number;
  installment: { seq: number; count: number } | null;
};

/**
 * Linhas do app no mês da fatura que a fatura NÃO cobrou. Cada par é consumido
 * uma vez, então duas linhas iguais no app precisam de duas na fatura.
 *
 * O pagamento da fatura anterior fica fora do pool: ele não é importado, logo
 * nada no app deveria casar com ele.
 */
export function findOrphans(appRows: AppRow[], faturaLines: FaturaLine[]): AppRow[] {
  const pool = new Map<string, number>();
  for (const line of faturaLines) {
    if (line.kind === "payment") continue;
    const k = matchKey(line.description, line.cents);
    pool.set(k, (pool.get(k) ?? 0) + 1);
  }
  const orphans: AppRow[] = [];
  for (const row of appRows) {
    const k = matchKey(row.description, row.cents);
    const available = pool.get(k) ?? 0;
    if (available > 0) pool.set(k, available - 1);
    else orphans.push(row);
  }
  return orphans;
}
