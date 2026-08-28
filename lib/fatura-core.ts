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

/**
 * Tolerância de centavos ao casar o valor de uma parcela.
 *
 * O banco arredonda entre as parcelas do mesmo plano: na fatura de ago/2026,
 * `Renner 427 Jockey Plaz` é R$ 159,88 na parcela 1 e R$ 159,86 na 3;
 * `Mlp*Magalu-Loja Hasbro` vai de 87,52 a 87,49. Medido, o desvio máximo foi de
 * 3 centavos — 10 dá folga sem chegar perto de confundir planos distintos (as
 * duas Privalia de 5x do mesmo mês estão a R$ 22,28 uma da outra).
 *
 * Mora aqui porque o casamento de PLANO (`fatura-plan`) e o de LINHA
 * (`fatura-match`) têm que usar a mesma régua: enquanto o de linha exigia valor
 * exato, a diferença de centavos que o de plano perdoava transformava parcela já
 * cobrada em "parcela atrasada" e dobrava a cauda.
 */
export const CENTS_TOLERANCE = 10;

/** Soma líquida dos lançamentos SEM o pagamento da fatura anterior. */
export function sumFaturaLines(lines: FaturaLine[]): number {
  return lines.filter((l) => l.kind !== "payment").reduce((acc, l) => acc + l.cents, 0);
}

// `ownedByRebuild` viveu aqui: decidia por DATA + marcador quais linhas de meses
// futuros a reconstrução podia apagar. Saiu quando a reconciliação passou a
// decidir por IDENTIDADE DE PLANO (`lib/fatura-plan.ts`), que não precisa de
// data — e data não bastava, porque o corte da fatura do Nubank é intradiário.

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
export function planKey(row: { description: string; cents: number }, installment: { count: number }): string {
  const base = row.description
    .replace(/^Antecipada - /, "")
    .replace(NUBANK_MARKER_RE, "")
    .replace(BRADESCO_MARKER_RE, "");
  return [base, installment.count, row.cents].join("|");
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
