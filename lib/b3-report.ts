import * as XLSX from "xlsx";

/**
 * Parser dos relatórios .xlsx da Área do Investidor B3:
 * - "Negociação" (extrato de negociação): compras/vendas → trades
 * - "Movimentação": proventos pagos (Dividendo/JSCP/Rendimento) → incomes
 *   (negócios da Movimentação são IGNORADOS de propósito — trades vêm só do
 *   relatório de Negociação, para nunca contar em dobro)
 */

export type B3Trade = {
  dateISO: string; // YYYY-MM-DD
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  /** Preço unitário em reais. */
  price: number;
  /** Valor total em reais. */
  value: number;
};

export type B3Income = {
  dateISO: string;
  ticker: string;
  type: "Dividendos" | "JSCP" | "Rendimento";
  quantity: number | null;
  unitValue: number | null;
  /** Valor creditado em reais. */
  value: number;
};

export type B3ParseResult = {
  kind: "negociacao" | "movimentacao" | "unknown";
  trades: B3Trade[];
  incomes: B3Income[];
  skipped: number;
};

const TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

function normalizeHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** "BBSE3F" (fracionário) → "BBSE3"; valida o formato de ticker. */
export function normalizeTicker(raw: string): string | null {
  let t = raw.trim().toUpperCase();
  if (/^[A-Z]{4}\d{1,2}F$/.test(t)) t = t.slice(0, -1);
  return TICKER_RE.test(t) ? t : null;
}

/** "BBSE3 - BB SEGURIDADE..." → "BBSE3". */
function tickerFromProduto(produto: string): string | null {
  const first = produto.split("-")[0]?.trim() ?? "";
  return normalizeTicker(first);
}

function toISO(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/R\$/g, "").replace(/\s/g, "");
    if (!cleaned || cleaned === "-") return null;
    const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const INCOME_TYPES: Record<string, B3Income["type"]> = {
  dividendo: "Dividendos",
  dividendos: "Dividendos",
  "juros sobre capital proprio": "JSCP",
  rendimento: "Rendimento",
};

export function parseB3Report(buffer: ArrayBuffer | Buffer): B3ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });
  if (rows.length === 0) return { kind: "unknown", trades: [], incomes: [], skipped: 0 };

  const header = (rows[0] ?? []).map(normalizeHeader);
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));

  // --- Negociação: Data do Negócio | Tipo de Movimentação | ... | Código de Negociação | Quantidade | Preço | Valor
  const codIdx = idx(["codigo de negociacao"]);
  if (codIdx >= 0) {
    const dateIdx = idx(["data do negocio"]);
    const sideIdx = idx(["tipo de movimentacao"]);
    const qtyIdx = idx(["quantidade"]);
    const priceIdx = idx(["preco"]);
    const valueIdx = idx(["valor"]);
    const trades: B3Trade[] = [];
    let skipped = 0;
    for (const row of rows.slice(1)) {
      if (!row || row.length === 0) continue;
      const ticker = typeof row[codIdx] === "string" ? normalizeTicker(row[codIdx] as string) : null;
      const dateISO = toISO(row[dateIdx]);
      const sideRaw = normalizeHeader(row[sideIdx]);
      const quantity = toNumber(row[qtyIdx]);
      const price = toNumber(row[priceIdx]);
      const value = toNumber(row[valueIdx]);
      if (!ticker || !dateISO || quantity === null || price === null || !sideRaw) {
        skipped++;
        continue;
      }
      const side = sideRaw.startsWith("compra") ? "BUY" : sideRaw.startsWith("venda") ? "SELL" : null;
      if (!side) {
        skipped++;
        continue;
      }
      trades.push({
        dateISO,
        ticker,
        side,
        quantity: Math.round(quantity),
        price,
        value: value ?? Math.round(quantity * price * 100) / 100,
      });
    }
    return { kind: "negociacao", trades, incomes: [], skipped };
  }

  // --- Movimentação: Entrada/Saída | Data | Movimentação | Produto | ... | Quantidade | Preço unitário | Valor da Operação
  const movIdx = idx(["movimentacao"]);
  const prodIdx = idx(["produto"]);
  if (movIdx >= 0 && prodIdx >= 0) {
    const inOutIdx = idx(["entrada/saida", "entrada / saida"]);
    const dateIdx = idx(["data"]);
    const qtyIdx = idx(["quantidade"]);
    const unitIdx = idx(["preco unitario"]);
    const valueIdx = idx(["valor da operacao", "valor"]);
    const incomes: B3Income[] = [];
    let skipped = 0;
    for (const row of rows.slice(1)) {
      if (!row || row.length === 0) continue;
      const movType = INCOME_TYPES[normalizeHeader(row[movIdx])];
      if (!movType) {
        skipped++; // negócios/atualizações/bonificações ficam de fora de propósito
        continue;
      }
      const inOut = inOutIdx >= 0 ? normalizeHeader(row[inOutIdx]) : "credito";
      if (inOut && !inOut.startsWith("credito") && !inOut.startsWith("entrada")) {
        skipped++;
        continue;
      }
      const ticker = typeof row[prodIdx] === "string" ? tickerFromProduto(row[prodIdx] as string) : null;
      const dateISO = toISO(row[dateIdx]);
      const value = toNumber(row[valueIdx]);
      if (!ticker || !dateISO || value === null || value <= 0) {
        skipped++;
        continue;
      }
      incomes.push({
        dateISO,
        ticker,
        type: movType,
        quantity: toNumber(row[qtyIdx]) !== null ? Math.round(toNumber(row[qtyIdx])!) : null,
        unitValue: toNumber(row[unitIdx]),
        value,
      });
    }
    return { kind: "movimentacao", trades: [], incomes, skipped };
  }

  return { kind: "unknown", trades: [], incomes: [], skipped: rows.length - 1 };
}
