// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { replaceCardMonth, type CardMonthRow } from "@/lib/card-entry";
import { installmentMonths } from "@/lib/installments";

/**
 * Importa a aba "Cartão Bradesco" da planilha: cada coluna é uma fatura
 * (ago/2026..abr/2027) e cada linha uma compra com o valor da parcela nos
 * meses em que ela corre. Usa replaceCardMonth (idempotente: substitui o
 * extrato + total consolidado do mês). Valida contra a linha de totais da
 * própria planilha — divergência de mais de R$ 0,01/mês aborta.
 */
const FILE = path.resolve(process.cwd(), "Contas Mensais.xlsx");
const SHEET = "Cartão Bradesco";

async function main() {
  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: "bradesco", mode: "insensitive" } },
  });
  if (!card) throw new Error("Cartão Bradesco não encontrado no banco.");

  const wb = XLSX.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Aba "${SHEET}" não encontrada.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  // Cabeçalho: primeiro mês = primeira célula Date; coluna "Total" excluída.
  const header = rows[0] ?? [];
  const firstDate = header.find((c): c is Date => c instanceof Date);
  if (!firstDate) throw new Error("Nenhum mês (célula de data) no cabeçalho.");
  const firstMonth = monthStringFromDate(new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1)));
  const totalColIdx = header.findIndex((c) => typeof c === "string" && /^total$/i.test(c.trim()));

  // Linha de totais (desc vazia + números): as colunas numéricas dela — menos
  // a coluna "Total" — são as COLUNAS DE DADOS. O rótulo de mês da planilha
  // tem célula vazia/deslocada no fim, então os meses são tratados como
  // CONSECUTIVOS a partir do primeiro (parcelas correm mês a mês).
  const totalsRow = rows.findLast(
    (r) => r && (r[0] === undefined || r[0] === null || String(r[0]).trim() === "") && r.filter((c) => typeof c === "number").length > 1,
  );
  if (!totalsRow) throw new Error("Linha de totais não encontrada.");
  const dataCols = totalsRow
    .map((c, i) => (typeof c === "number" ? i : -1))
    .filter((i) => i > 0 && i !== totalColIdx);
  const months = installmentMonths(firstMonth, dataCols.length);

  // Compras: linhas com descrição não vazia (para na linha de totais).
  const purchases = rows
    .slice(1)
    .filter((r) => r && typeof r[0] === "string" && r[0].trim() !== "");

  let grandCents = 0;
  const report: string[] = [];
  for (let k = 0; k < dataCols.length; k++) {
    const col = dataCols[k];
    const month = months[k];
    const monthRows: CardMonthRow[] = [];
    for (const r of purchases) {
      const v = r[col];
      if (typeof v !== "number" || v === 0) continue;
      monthRows.push({ description: String(r[0]).trim(), amountCents: Math.round(v * 100) });
    }
    const sheetTotalCents = Math.round((totalsRow[col] as number) * 100);
    const computedCents = monthRows.reduce((acc, r) => acc + r.amountCents, 0);
    if (Math.abs(computedCents - sheetTotalCents) > 1) {
      throw new Error(
        `Divergência em ${month}: soma ${formatCents(computedCents)} ≠ total da planilha ${formatCents(sheetTotalCents)}. Import abortado.`,
      );
    }
    const { totalCents } = await replaceCardMonth(
      { id: card.id, name: card.name, closingDay: card.closingDay },
      month,
      monthRows,
    );
    grandCents += totalCents;
    report.push(`  ${month}: ${monthRows.length} lançamentos — ${formatCents(totalCents)} ✓`);
  }

  console.log(`Fatura ${card.name} importada (${months.length} meses):`);
  for (const line of report) console.log(line);
  console.log(`Total geral: ${formatCents(grandCents)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
