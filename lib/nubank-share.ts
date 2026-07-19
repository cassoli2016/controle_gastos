/**
 * Parser do formato de COMPARTILHAMENTO de compra do Nubank (o texto que o
 * app do banco gera ao compartilhar uma notificação de compra):
 *
 *   Casa China Americas          ← descrição
 *   R$ 6,99                      ← valor total
 *   em 6x de R$ 35,53            ← (opcional) parcelamento, valor POR parcela
 *   Domingo, 19 de Julho de 2026, 11:30   ← data da compra
 *   Cartão Nubank                ← cartão
 *
 * Vários blocos podem vir colados na mesma mensagem.
 */

export type ParsedShare = {
  description: string;
  /** Valor POR parcela em reais (na compra à vista = valor total). */
  amountReais: number;
  installments: number;
  /** Data da compra (YYYY-MM-DD), quando presente. */
  date?: string;
  /** Nome do cartão em minúsculas ("Cartão Nubank" → "nubank"). */
  cardHint?: string;
};

export type ShareParseResult = {
  purchases: ParsedShare[];
  failedLines: string[];
};

const AMOUNT_LINE_RE = /^R\$\s*([\d.]+(?:,\d{1,2})?)$/;
const INSTALLMENT_LINE_RE = /^em\s+(\d{1,3})x(?:\s+de\s+R\$\s*([\d.]+(?:,\d{1,2})?))?$/i;
const CARD_LINE_RE = /^cart[aã]o\s+(.+)$/i;
const DATE_LINE_RE = /(\d{1,2})\s+de\s+([a-zA-ZçÇãÃéÉêÊ]+)\s+de\s+(\d{4})/;

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseBRL(token: string): number {
  return Number(token.replace(/\./g, "").replace(",", "."));
}

function parseShareDate(line: string): string | undefined {
  const m = DATE_LINE_RE.exec(line);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = MONTHS[stripAccents(m[2].toLowerCase())];
  if (!month || day < 1 || day > 31) return undefined;
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True se a mensagem tem alguma linha só com o valor ("R$ 6,99"). */
export function isNubankShareFormat(text: string): boolean {
  return text.split(/\r?\n/).some((l) => AMOUNT_LINE_RE.test(l.trim()));
}

export function parseNubankShares(text: string): ShareParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const purchases: ParsedShare[] = [];
  const failedLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    // Um bloco começa em: linha de descrição seguida da linha de valor "R$ …".
    const amountMatch = i + 1 < lines.length ? AMOUNT_LINE_RE.exec(lines[i + 1]) : null;
    if (AMOUNT_LINE_RE.test(lines[i]) || !amountMatch) {
      failedLines.push(lines[i]);
      i++;
      continue;
    }

    const totalReais = parseBRL(amountMatch[1]);
    const purchase: ParsedShare = {
      description: lines[i],
      amountReais: totalReais,
      installments: 1,
    };

    // Consome as linhas seguintes do bloco (parcelamento, data, cartão) até
    // encontrar algo que não pertence a ele.
    let j = i + 2;
    while (j < lines.length) {
      const line = lines[j];
      const inst = INSTALLMENT_LINE_RE.exec(line);
      if (inst) {
        purchase.installments = Math.max(1, parseInt(inst[1], 10));
        // Usa o valor POR parcela informado; sem ele, divide o total.
        purchase.amountReais = inst[2]
          ? parseBRL(inst[2])
          : Math.round((totalReais / purchase.installments) * 100) / 100;
        j++;
        continue;
      }
      const card = CARD_LINE_RE.exec(line);
      if (card) {
        purchase.cardHint = card[1].trim().toLowerCase();
        j++;
        continue;
      }
      const date = parseShareDate(line);
      if (date) {
        purchase.date = date;
        j++;
        continue;
      }
      break;
    }

    if (Number.isFinite(purchase.amountReais) && purchase.amountReais > 0) {
      purchases.push(purchase);
    } else {
      failedLines.push(`${purchase.description} — valor inválido`);
    }
    i = j;
  }

  return { purchases, failedLines };
}
