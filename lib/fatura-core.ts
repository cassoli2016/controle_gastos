/**
 * Núcleo compartilhado da importação de faturas: tipos e helpers puros sobre
 * linhas de lançamento, sem dependência de parser nem de prisma.
 *
 * É FOLHA do grafo de imports de propósito: os parsers precisam de
 * `sumFaturaLines` para a própria checagem de transcrição, e `fatura-parse`
 * importa os parsers — pôr estes helpers lá fecharia um ciclo.
 */
import { monthToDate, monthStringFromDate } from "@/lib/dates";

export type FaturaLineKind = "purchase" | "refund" | "payment";

export type FaturaBank = "nubank" | "bradesco";

export type FaturaLine = {
  dateISO: string;
  description: string;
  /** Negativo em refund/payment. */
  cents: number;
  kind: FaturaLineKind;
  installment: { seq: number; count: number } | null;
};

export type ParsedFatura = {
  bank: FaturaBank;
  /** Competência = mês do vencimento (YYYY-MM). */
  faturaMonth: string;
  dueDateISO: string;
  closingISO: string;
  /** "Total a pagar" (Nubank) / "Total da fatura" (Bradesco). */
  totalCents: number;
  /**
   * Soma que as linhas purchase+refund TÊM que dar. No Bradesco é igual a
   * `totalCents`; no Nubank é maior, porque a antecipação do meio do ciclo entra
   * no "Pagamento recebido" do resumo e vive no banco como
   * CardTransaction.prepayment.
   */
  expectedLinesCents: number;
  limitCents: number | null;
  /**
   * O que o banco projeta para as próximas faturas. `remainingCents` só existe
   * no Bradesco ("Demais faturas"). Informativo: no Nubank estes números já
   * incluem compras do ciclo novo, então não servem para validar o cronograma.
   */
  upcoming: { nextCents: number; remainingCents?: number; totalCents: number } | null;
  /**
   * Valores do bloco de resumo, com CHAVES ESPECÍFICAS DE CADA BANCO. Serve de
   * diagnóstico (mensagem de erro, teste), não de contrato entre módulos — quem
   * consome fatura usa `totalCents` e `expectedLinesCents`.
   */
  summary: Record<string, number>;
  lines: FaturaLine[];
  warnings: string[];
};

/** Soma líquida dos lançamentos SEM o pagamento da fatura anterior. */
export function sumFaturaLines(lines: FaturaLine[]): number {
  return lines.filter((l) => l.kind !== "payment").reduce((acc, l) => acc + l.cents, 0);
}

/** Marcador de parcela no fim da descrição: Nubank "- Parcela 8/12", Bradesco "(09/12)". */
const INSTALLMENT_MARKER_RE = /(?: - Parcela \d+\/\d+|\(\d{2}\/\d{2}\))$/;

/**
 * Numa fatura FUTURA, esta linha pertence à reconstrução (pode ser apagada e
 * regerada pelo cronograma) ou é compra de verdade do ciclo novo, que precisa
 * sobreviver?
 *
 * Não dá para decidir só pela data. O corte da fatura do Nubank é intradiário
 * (emitida às 03:31 do dia do fechamento), então há compra do ciclo NOVO datada
 * ANTES do fechamento — na fatura-modelo, cinco compras de 04/08 que o banco
 * jogou para setembro, com fechamento em 05/08. Apagar por data levaria
 * R$ 941,04 de setembro embora.
 *
 * Quem manda é o marcador de parcela: a reconstrução só gera parcelas, então só
 * parcelas são dela. Linha sem data é projeção antiga da planilha e também sai.
 */
export function ownedByRebuild(row: { description: string; purchaseDate: Date | null }, cutoff: Date): boolean {
  if (row.purchaseDate === null) return true; // projeção da planilha, sem data
  if (row.purchaseDate > cutoff) return false; // ciclo novo, sem ambiguidade
  return INSTALLMENT_MARKER_RE.test(row.description);
}

const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)/;
const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;

/** Reescreve o marcador da parcela na descrição, no formato de cada banco. */
function renumber(description: string, seq: number, count: number, bank: FaturaBank): string {
  if (bank === "bradesco") {
    return description.replace(
      BRADESCO_MARKER_RE,
      `(${String(seq).padStart(2, "0")}/${String(count).padStart(2, "0")})`,
    );
  }
  return description.replace(NUBANK_MARKER_RE, ` - Parcela ${seq}/${count}`);
}

/**
 * Chave do PLANO de parcelamento: loja + total de parcelas + valor por parcela.
 * O prefixo "Antecipada - " sai da chave porque a parcela antecipada pertence ao
 * mesmo plano da parcela normal. O valor entra porque a mesma loja pode ter dois
 * planos simultâneos (na fatura-modelo do Nubank, Associacao Franciscana tem um
 * de 9x R$ 30,88 e outro de 12x R$ 17,99).
 */
function planKey(line: FaturaLine, installment: { seq: number; count: number }): string {
  const base = line.description
    .replace(/^Antecipada - /, "")
    .replace(NUBANK_MARKER_RE, "")
    .replace(BRADESCO_MARKER_RE, "");
  return [base, installment.count, line.cents].join("|");
}

function shiftMonthISO(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/**
 * Parcelas futuras: para cada PLANO, projeta a partir da MAIOR parcela cobrada
 * nesta fatura — as anteriores já foram pagas, inclusive as antecipadas, que o
 * Nubank cobra todas no mesmo ciclo. Projetar por linha duplicaria: na
 * fatura-modelo daria R$ 26.234,86 em vez de R$ 20.028,97.
 *
 * Estorno e pagamento não projetam nada (estorno de parcelado cancela o plano
 * inteiro — regra validada contra o "Total parcelado" do PDF do Bradesco).
 */
export function buildInstallmentSchedule(
  lines: FaturaLine[],
  faturaMonth: string,
  bank: FaturaBank,
): Map<string, { dateISO: string; description: string; cents: number }[]> {
  const plans = new Map<string, { line: FaturaLine; seq: number; count: number }>();
  for (const line of lines) {
    if (line.kind !== "purchase" || !line.installment) continue;
    const { seq, count } = line.installment;
    const key = planKey(line, line.installment);
    const current = plans.get(key);
    if (!current || seq > current.seq) plans.set(key, { line, seq, count });
  }

  const byMonth = new Map<string, { dateISO: string; description: string; cents: number }[]>();
  for (const { line, seq, count } of plans.values()) {
    for (let k = seq + 1; k <= count; k++) {
      const month = shiftMonthISO(faturaMonth, k - seq);
      const list = byMonth.get(month) ?? [];
      list.push({ dateISO: line.dateISO, description: renumber(line.description, k, count, bank), cents: line.cents });
      byMonth.set(month, list);
    }
  }
  return byMonth;
}
