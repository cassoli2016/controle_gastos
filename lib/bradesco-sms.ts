import type { ParsedShare, ShareParseResult } from "@/lib/nubank-share";

/**
 * Parser do SMS de compra aprovada do Bradesco (uma compra por linha):
 *
 *   CARTAO AMAZON: COMPRA APROVADA NO CARTAO FINAL 2010 18/07/2026 15:03.
 *   VALOR DE R$126,86 em 6X, AMAZON BR. LIMITE DISPONIVEL DE R$4447,58
 *
 * "CARTAO <nome>:" identifica o cartão; o valor é o TOTAL da compra (dividido
 * pelas parcelas ao lançar — convenção de valor POR parcela do consolidado);
 * a data roteia a fatura pelo fechamento; o limite disponível é ignorado.
 */

const SMS_RE =
  /^cart[aã]o\s+(.+?):\s*compra\s+aprovada\b.*?(\d{2})\/(\d{2})\/(\d{4}).*?valor\s+de\s+r\$\s*([\d.]+(?:,\d{1,2})?)(?:\s+em\s+(\d{1,3})\s*x)?\s*,\s*(.+?)(?:\s*\.\s*limite\b.*)?$/i;

function parseBRL(token: string): number {
  return Number(token.replace(/\./g, "").replace(",", "."));
}

/** True se a mensagem tem alguma linha no formato do SMS do Bradesco. */
export function isBradescoSmsFormat(text: string): boolean {
  return text.split(/\r?\n/).some((l) => SMS_RE.test(l.trim()));
}

export function parseBradescoSms(text: string): ShareParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const purchases: ParsedShare[] = [];
  const failedLines: string[] = [];

  for (const line of lines) {
    const m = SMS_RE.exec(line);
    if (!m) {
      failedLines.push(line);
      continue;
    }
    const [, cardHint, dd, mm, yyyy, valor, parcelas, estabelecimento] = m;
    const totalReais = parseBRL(valor);
    const installments = parcelas ? Math.max(1, parseInt(parcelas, 10)) : 1;
    if (!Number.isFinite(totalReais) || totalReais <= 0) {
      failedLines.push(`${line} — valor inválido`);
      continue;
    }
    purchases.push({
      description: estabelecimento.replace(/\.\s*$/, "").trim(),
      // Valor POR parcela (mesma convenção do share do Nubank sem "de R$ X").
      amountReais: installments > 1 ? Math.round((totalReais / installments) * 100) / 100 : totalReais,
      installments,
      date: `${yyyy}-${mm}-${dd}`,
      cardHint: cardHint.trim().toLowerCase(),
    });
  }

  return { purchases, failedLines };
}
