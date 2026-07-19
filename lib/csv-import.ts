export type CsvRow = {
  description: string;
  amountReais: number;
  /** Data da compra (YYYY-MM-DD), quando o CSV tem coluna de data. */
  date?: string;
};

export type CsvParseResult = {
  rows: CsvRow[];
  /**
   * Linhas puladas de propósito: pagamento da fatura anterior ("Pagamento
   * recebido", negativo) e valores zero. Estornos NÃO entram aqui — são
   * incluídos em rows com valor negativo para abater o total da fatura.
   */
  ignored: number;
  /** Linhas que não puderam ser interpretadas (valor/descrição inválidos). */
  failed: number;
};

/** Pagamento da fatura anterior — não é despesa nem estorno de compra. */
const PAYMENT_RE = /pagamento/i;

// Nomes de coluna reconhecidos (comparados sem acento e em minúsculas).
const DESCRIPTION_COLUMNS = ["title", "titulo", "descricao", "description", "estabelecimento", "lancamento"];
const AMOUNT_COLUMNS = ["amount", "valor", "value"];
const DATE_COLUMNS = ["date", "data"];

/** "2026-07-04" ou "19/07/2026" → "YYYY-MM-DD"; outros formatos → undefined. */
function parseDateCell(cell: string): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell);
  if (iso) return cell;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cell);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return undefined;
}

function normalizeHeader(cell: string): string {
  return cell
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Divide uma linha CSV respeitando aspas duplas ("Mercado, SP" é uma célula só). */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'; // aspas escapadas ("")
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** "1.299,90" (pt-BR), "54.9" (decimal com ponto) ou "-1200.00" → número em reais. */
function parseAmountCell(cell: string): number | null {
  const cleaned = cell.replace(/R\$/g, "").replace(/\s/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta o CSV de uma fatura de cartão. Suporta o formato do Nubank
 * (cabeçalho date,title,amount — decimais com ponto) e um formato genérico
 * "descrição;valor" (decimais pt-BR), com ou sem cabeçalho. Valores
 * negativos/zero (pagamentos e estornos) são contados em `ignored`.
 */
export function parseCardCsv(content: string): CsvParseResult {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: CsvParseResult = { rows: [], ignored: 0, failed: 0 };
  if (lines.length === 0) return result;

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headerCells = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

  // Cabeçalho presente se alguma célula da primeira linha é um nome conhecido.
  const descIdx = headerCells.findIndex((c) => DESCRIPTION_COLUMNS.includes(c));
  const amountIdx = headerCells.findIndex((c) => AMOUNT_COLUMNS.includes(c));
  const dateIdx = headerCells.findIndex((c) => DATE_COLUMNS.includes(c));
  const hasHeader = descIdx >= 0 || amountIdx >= 0;

  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const cells = splitCsvLine(line, delimiter);
    // Sem cabeçalho: descrição = primeira coluna, valor = última.
    const description = (hasHeader && descIdx >= 0 ? cells[descIdx] : cells[0])?.trim() ?? "";
    const amountCell = hasHeader && amountIdx >= 0 ? cells[amountIdx] : cells[cells.length - 1];
    const amount = amountCell !== undefined ? parseAmountCell(amountCell) : null;

    if (!description || amount === null) {
      result.failed++;
      continue;
    }
    // Zero não diz nada; negativo de "pagamento" é a fatura anterior sendo
    // paga. Estornos (outros negativos) ENTRAM e abatem o total.
    if (amount === 0 || (amount < 0 && PAYMENT_RE.test(description))) {
      result.ignored++;
      continue;
    }
    const date = hasHeader && dateIdx >= 0 && cells[dateIdx] ? parseDateCell(cells[dateIdx]) : undefined;
    const row: CsvRow = { description, amountReais: Math.round(amount * 100) / 100 };
    if (date) row.date = date;
    result.rows.push(row);
  }
  return result;
}
