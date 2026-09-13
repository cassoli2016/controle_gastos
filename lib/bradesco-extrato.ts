/**
 * Parser do EXTRATO EM ABERTO do app Bradesco Cartões — a "fatura parcial",
 * gerada antes do fechamento do ciclo. É um documento DIFERENTE da fatura
 * fechada de `lib/bradesco-fatura.ts`; layout e diferenças em
 * `docs/fatura-bradesco-pdf.md`.
 *
 * Duas consequências de ser "em aberto" moldam o módulo inteiro:
 *
 *   1. **Não tem vencimento.** A competência sai da data de GERAÇÃO do PDF
 *      (cabeçalho "Data: dd/mm/aaaa") somada ao ciclo do cartão, via
 *      `faturaMonth`. Por isso o parser continua puro e devolve `generatedISO`
 *      em vez de `faturaMonth` — quem conhece o cartão é o chamador.
 *
 *   2. **A lista pode estar incompleta.** Medido no extrato de 13/09/2026: 26
 *      linhas contra 50 que o app tinha na mesma competência, e mesmo assim a
 *      soma fechava com o "Total da Fatura em Real" declarado — ou seja, o
 *      documento é auto-consistente sem ser completo. Logo o parser NUNCA aborta
 *      por divergência de soma (a fatura fechada aborta, e deve continuar
 *      abortando); a conferência que consome isto é ADITIVA — ver
 *      `lib/extrato-confere.ts`.
 */
import { parseBRLToCents, formatCents } from "@/lib/money";
import { normalizeDescription } from "@/lib/description-match";
import type { FaturaLine } from "@/lib/fatura-core";

export type ParsedExtrato = {
  kind: "extrato";
  bank: "bradesco";
  /** Data de geração do PDF (cabeçalho). Base da competência e da inferência de ano. */
  generatedISO: string;
  /** "Total da Fatura em Real": o total DAS LINHAS QUE O EXTRATO MOSTRA. */
  statementTotalCents: number;
  /** "Total para <titular>". Informativo — não deriva das linhas listadas. */
  holderTotalCents: number | null;
  lines: FaturaLine[];
  warnings: string[];
};

const GENERATED_RE = /^Data:\s*(\d{2})\/(\d{2})\/(\d{4})/m;
const STATEMENT_TOTAL_RE = /Total da Fatura em Real\b[^\n]*?R\$\s*([\d.,]+)/i;
const HOLDER_TOTAL_RE = /Total para\b[^\n]*?R\$\s*([\d.,]+)/i;

/**
 * Bloco de colunas de câmbio + valor no fim da linha. É a âncora do documento:
 * toda linha de lançamento termina assim, e nenhuma outra linha tem esse bloco.
 * O sinal do negativo vem ANTES do número (a fatura fechada põe depois).
 */
const COLS_RE = /\s+000\s+[\d.,]+\s+[\d.,]+\s+R\$\s*[\d.,]+\s+(-?[\d.]*\d,\d{2})\s*$/;
const DATE_PREFIX_RE = /^(\d{2})\/(\d{2})\s+/;
/** Marcador de parcela do extrato: `9/14`, sem parênteses e sem zero à esquerda. */
const MARKER_RE = /\s(\d{1,2})\/(\d{1,2})$/;

/** Reconhece o documento. As duas âncoras juntas: só o extrato em aberto tem as duas. */
export function isBradescoExtrato(text: string): boolean {
  return /Situa[çc][ãa]o do Extrato/i.test(text) && /Aplicativo Bradesco Cart/i.test(text);
}

/**
 * Junta a descrição quebrada em duas linhas do texto extraído. O PDF quebra o
 * nome do estabelecimento, e a data cai ora na primeira linha, ora na segunda:
 *
 *     30/08 AMAZONMKTPLC*JAVIANACO   |   AMAZONMKTPLC*NOGORACOM
 *     SA 1/10 000 0,00 ... 43,98     |   09/07 SA 3/10 000 0,00 ... 21,63
 *
 * `pending` guarda o pedaço solto. Qualquer linha com "R$"/"US$" que não seja
 * lançamento (cabeçalho da tabela, rodapé de totais) LIMPA o pending, para o
 * cabeçalho não virar prefixo do primeiro lançamento.
 */
function collectRows(text: string): { dateISO: [string, string] | null; desc: string; value: string }[] {
  const rows: { dateISO: [string, string] | null; desc: string; value: string }[] = [];
  let pending: string | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const cols = COLS_RE.exec(line);
    if (!cols) {
      pending = /R\$|US\$/.test(line) ? null : line;
      continue;
    }

    let head = line.slice(0, cols.index).trim();
    let date = DATE_PREFIX_RE.exec(head);
    if (date) head = head.slice(date[0].length).trim();

    if (pending) {
      let prefix = pending;
      const prefixDate = DATE_PREFIX_RE.exec(prefix);
      if (prefixDate) {
        prefix = prefix.slice(prefixDate[0].length).trim();
        date ??= prefixDate;
      }
      head = `${prefix} ${head}`.trim();
      pending = null;
    }

    if (head) rows.push({ dateISO: date ? [date[1], date[2]] : null, desc: head, value: cols[1] });
  }
  return rows;
}

export function parseBradescoExtrato(text: string): ParsedExtrato | { error: string } {
  const generated = GENERATED_RE.exec(text);
  const statementTotal = STATEMENT_TOTAL_RE.exec(text);
  if (!generated || !statementTotal) {
    return { error: "Não parece um extrato em aberto do Bradesco (PDF sem as âncoras esperadas)." };
  }
  const generatedISO = `${generated[3]}-${generated[2]}-${generated[1]}`;
  const generatedMonth = Number(generated[2]);
  const generatedYear = Number(generated[3]);

  const lines: FaturaLine[] = [];
  for (const row of collectRows(text)) {
    if (!row.dateISO) continue;
    const [dd, mm] = row.dateISO;
    // Mês da compra depois do mês da geração no calendário = ano anterior.
    const year = Number(mm) > generatedMonth ? generatedYear - 1 : generatedYear;

    const marker = MARKER_RE.exec(row.desc);
    const installment =
      marker && Number(marker[1]) <= Number(marker[2])
        ? { seq: Number(marker[1]), count: Number(marker[2]) }
        : null;
    const description = (installment ? row.desc.slice(0, marker!.index) : row.desc).trim();

    const negative = row.value.startsWith("-");
    const abs = parseBRLToCents(row.value.replace(/^-/, ""));
    const isPayment = normalizeDescription(description).includes("pagamento recebido");
    lines.push({
      dateISO: `${year}-${mm}-${dd}`,
      description,
      cents: negative ? -abs : abs,
      kind: isPayment ? "payment" : negative ? "refund" : "purchase",
      installment,
    });
  }
  if (lines.length === 0) return { error: "Nenhum lançamento encontrado no extrato." };

  const statementTotalCents = parseBRLToCents(statementTotal[1]);
  const holder = HOLDER_TOTAL_RE.exec(text);
  const soma = lines.filter((l) => l.kind !== "payment").reduce((a, l) => a + l.cents, 0);

  // Avisa, NÃO aborta: extrato em aberto é parcial por natureza.
  const warnings =
    soma === statementTotalCents
      ? []
      : [
          `A soma das linhas (${formatCents(soma)}) difere do total declarado (${formatCents(statementTotalCents)}) — o extrato deve estar cortado.`,
        ];

  return { kind: "extrato", bank: "bradesco", generatedISO, statementTotalCents, holderTotalCents: holder ? parseBRLToCents(holder[1]) : null, lines, warnings };
}
