// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { BASE_CATEGORIES, normalizeAmount, normalizeDueDay, keywordCategory } from "@/lib/import-normalize";
import { formatCents } from "@/lib/money";

const FILE = path.resolve(process.cwd(), "Contas Mensais.xlsx");
const SHEET = "Contas Fixas";

/**
 * Recria as CONTAS FIXAS a partir da planilha, SEM histórico: categorias +
 * itens (com dia de vencimento) e lançamentos apenas para os meses-alvo,
 * usando o valor da própria competência na planilha. Itens sem valor nos
 * meses-alvo são criados mesmo assim (ativos) para uso futuro.
 *
 * Uso: npx tsx scripts/reimport-fixas.ts 2026-07 2026-08
 */
const TARGET_MONTHS = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));

async function main() {
  if (TARGET_MONTHS.length === 0) {
    throw new Error("Informe os meses-alvo. Ex.: npx tsx scripts/reimport-fixas.ts 2026-07 2026-08");
  }

  const wb = XLSX.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Aba "${SHEET}" não encontrada na planilha.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  // Cabeçalho: col 0 vazio, col 1 = "DIA PGTO", cols 2.. = competências (datas).
  const header = rows[0] as unknown[];
  const monthCols = new Map<string, number>(); // "YYYY-MM" -> índice da coluna
  for (let c = 2; c < header.length; c++) {
    const h = header[c];
    if (h instanceof Date) {
      monthCols.set(monthStringFromDate(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1))), c);
    }
  }
  if (monthCols.size === 0) throw new Error("Nenhuma coluna de competência detectada.");

  const missingMonths = TARGET_MONTHS.filter((m) => !monthCols.has(m));
  if (missingMonths.length > 0) {
    console.warn(`⚠️ Competências ausentes na planilha (serão puladas): ${missingMonths.join(", ")}`);
  }

  // Linhas de item: até a primeira linha vazia ou marcador do painel de resumo
  // (mesma âncora defensiva do scripts/import.ts).
  const SUMMARY_MARKER = /^(total contas|saldo|caixa|diferen|dias)/i;
  const itemRows: unknown[][] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.length === 0) break;
    const rawName = typeof row[0] === "string" ? row[0].trim() : "";
    if (SUMMARY_MARKER.test(rawName)) break;
    itemRows.push(row);
  }

  let itemCount = 0;
  let entryCount = 0;
  const totalByMonth = new Map<string, number>(TARGET_MONTHS.map((m) => [m, 0]));

  await prisma.$transaction(
    async (tx) => {
      // Categorias: find-or-create (a "Cartão/Compras" do bot já pode existir).
      const catByName = new Map<string, string>();
      for (const c of BASE_CATEGORIES) {
        const existing = await tx.category.findFirst({ where: { name: c.name } });
        const id = existing?.id ?? (await tx.category.create({ data: { name: c.name, type: c.type, color: c.color } })).id;
        catByName.set(c.name, id);
      }

      for (const row of itemRows) {
        const name = typeof row[0] === "string" ? row[0].trim() : null;
        if (!name) continue;

        const dueDay = normalizeDueDay(row[1]);
        const item = await tx.item.create({
          data: { name, categoryId: catByName.get(keywordCategory(name))!, dueDay, active: true },
        });
        itemCount++;

        for (const month of TARGET_MONTHS) {
          const col = monthCols.get(month);
          if (col === undefined) continue;
          const amount = normalizeAmount(row[col]);
          if (amount === null || amount === 0) continue;
          await tx.monthlyEntry.create({
            data: { itemId: item.id, month: monthToDate(month), plannedAmount: amount, paid: false },
          });
          entryCount++;
          totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + Math.round(amount * 100));
        }
      }
    },
    { timeout: 120_000 },
  );

  console.log(`Reimport concluído: ${itemCount} itens, ${entryCount} lançamentos.`);
  for (const month of TARGET_MONTHS) {
    console.log(`  ${month}: ${formatCents(totalByMonth.get(month) ?? 0)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
