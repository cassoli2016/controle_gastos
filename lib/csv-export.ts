/**
 * CSV para abrir no Excel em português: separador ";", vírgula decimal e BOM
 * UTF-8 (sem o BOM o Excel come os acentos). Escape conforme RFC 4180.
 */

export type CsvCell = string | number | null | undefined;

const SEP = ";";
const BOM = "﻿";

/** Envolve em aspas quando a célula tem separador, aspas ou quebra de linha. */
function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (!/[;"\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Monta o CSV inteiro: BOM + cabeçalho + linhas. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const linhas = [headers.map(escapeCell).join(SEP), ...rows.map((r) => r.map(escapeCell).join(SEP))];
  return BOM + linhas.join("\r\n") + "\r\n";
}

/** Centavos → "1234,56" (vírgula decimal, sem milhar nem "R$"). */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Date (UTC) → "02/08/2026"; null → vazio. */
export function csvDate(d: Date | null): string {
  if (!d) return "";
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
