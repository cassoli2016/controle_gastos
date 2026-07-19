export type CsvRow = { description: string; amountReais: number };

export type CsvParseResult = {
  rows: CsvRow[];
  /** Linhas com valor ≤ 0 (pagamentos/estornos da fatura) — puladas de propósito. */
  ignored: number;
  /** Linhas que não puderam ser interpretadas (valor/descrição inválidos). */
  failed: number;
};

// Nomes de coluna reconhecidos (comparados sem acento e em minúsculas).
const DESCRIPTION_COLUMNS = ["title", "titulo", "descricao", "description", "estabelecimento", "lancamento"];
const AMOUNT_COLUMNS = ["amount", "valor", "value"];

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
    if (amount <= 0) {
      result.ignored++;
      continue;
    }
    result.rows.push({ description, amountReais: Math.round(amount * 100) / 100 });
  }
  return result;
}
