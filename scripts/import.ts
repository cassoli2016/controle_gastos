// Deve ser a PRIMEIRA linha: `tsx scripts/import.ts` não carrega o .env
// sozinho, e `lib/prisma.ts` lê `process.env.DATABASE_URL` no top-level do
// módulo (ao construir o driver adapter). Carregar o env antes do import do
// prisma garante que o adapter seja construído com a URL presente.
import "dotenv/config";

import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { BASE_CATEGORIES, normalizeAmount, normalizeDueDay, keywordCategory } from "@/lib/import-normalize";

const FILE = path.resolve(process.cwd(), "Contas Mensais.xlsx");
const SHEET = "Contas Fixas";
const RESET = process.argv.includes("--reset");

async function main() {
  // `cellDates: true` é essencial: sem essa opção o xlsx devolve datas de
  // cabeçalho como número serial (não `instanceof Date`), e a detecção de
  // colunas de competência abaixo não encontraria nenhuma coluna.
  const wb = XLSX.readFile(FILE, { cellDates: true });
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Aba "${SHEET}" não encontrada na planilha.`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  // Linha 0 = cabeçalho: col 0 vazio, col 1 = "DIA PGTO", cols 2.. = competências
  // (datas), penúltima "TOTAL", última "RANK". Usamos getters UTC (em vez de
  // getFullYear/getMonth locais) para não depender do fuso horário de quem
  // roda o script — as células vêm como Date com um resquício de horário
  // (ex. 03:00:28Z) mas o dia/mês/ano em UTC já é o competência pretendida.
  const header = rows[0] as unknown[];
  const monthCols: { col: number; month: string }[] = [];
  for (let c = 2; c < header.length; c++) {
    const h = header[c];
    if (h instanceof Date) {
      monthCols.push({
        col: c,
        month: monthStringFromDate(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1))),
      });
    }
  }
  if (monthCols.length === 0) {
    throw new Error(
      "Nenhuma coluna de competência (data) detectada no cabeçalho. Verifique se `cellDates: true` está sendo usado e se a aba/planilha não mudou de formato."
    );
  }
  console.log(`Colunas de competência detectadas: ${monthCols.length} (${monthCols[0].month}..${monthCols[monthCols.length - 1].month}).`);

  // A tabela de itens (linhas 1..N) termina na primeira linha totalmente
  // vazia. Depois dela a aba contém um painel de resumo/saldo com layout
  // diferente ("TOTAL CONTAS", "SALDO TÉORICO", "DIAS", "CAIXA", "DIFERENÇA",
  // "SALDO" etc.) — não são Itens de conta fixa e importá-los infla o total
  // em ~500 mil (confirmado manualmente contra a planilha real).
  const itemRows: unknown[][] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || row.length === 0) break;
    itemRows.push(row);
  }
  console.log(`Linhas de item detectadas antes do painel de resumo: ${itemRows.length}.`);

  // Sanity-check: soma da coluna TOTAL da planilha para as linhas de item
  // (ignorada para carga — usada só para comparar com o total importado).
  let sheetTotal = 0;
  for (const row of itemRows) {
    const t = row[24];
    if (typeof t === "number") sheetTotal += t;
  }

  let itemCount = 0;
  let entryCount = 0;
  let importedTotalCents = 0;

  await prisma.$transaction(
    async (tx) => {
      if (RESET) {
        await tx.monthlyEntry.deleteMany();
        await tx.item.deleteMany();
        await tx.category.deleteMany();
      }

      // Semear categorias
      const catByName = new Map<string, string>();
      for (const c of BASE_CATEGORIES) {
        const created = await tx.category.create({ data: { name: c.name, type: c.type, color: c.color } });
        catByName.set(c.name, created.id);
      }

      for (const row of itemRows) {
        const name = typeof row[0] === "string" ? row[0].trim() : null;
        if (!name) continue;

        const categoryName = keywordCategory(name);
        const dueDay = normalizeDueDay(row[1]);
        const item = await tx.item.create({
          data: { name, categoryId: catByName.get(categoryName)!, dueDay, active: true },
        });
        itemCount++;

        // Célula vazia ou valor 0 = sem MonthlyEntry.
        const entriesData = monthCols
          .map(({ col, month }) => ({ month, amount: normalizeAmount(row[col]) }))
          .filter((e): e is { month: string; amount: number } => e.amount !== null && e.amount !== 0)
          .map(({ month, amount }) => ({
            itemId: item.id,
            month: monthToDate(month),
            plannedAmount: amount,
            paid: false,
          }));

        if (entriesData.length > 0) {
          await tx.monthlyEntry.createMany({ data: entriesData });
          entryCount += entriesData.length;
          for (const e of entriesData) importedTotalCents += Math.round(Number(e.plannedAmount) * 100);
        }
      }
    },
    { timeout: 120_000 }
  );

  const importedTotal = importedTotalCents / 100;
  const diff = importedTotal - sheetTotal;
  const diffOk = Math.abs(diff) < 0.01;

  console.log(`Import concluído.`);
  console.log(`Categorias: ${BASE_CATEGORIES.length}. Itens: ${itemCount}. Lançamentos: ${entryCount}.`);
  console.log(`Total importado (previsto): ${importedTotal.toFixed(2)}`);
  console.log(`Soma da coluna TOTAL da planilha (linhas de item): ${sheetTotal.toFixed(2)}`);
  console.log(`Diferença: ${diff.toFixed(2)} ${diffOk ? "(OK, bate com a planilha)" : "(DIVERGÊNCIA — revisar células não parseadas)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
