// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Devolve ao banco lançamentos salvos por um script de limpeza.
 *
 * Os backups de `scripts/limpa-*.ts` guardam as linhas inteiras, com id — a
 * restauração recria cada uma com o MESMO id, então referências que apontavam
 * para elas voltam a valer e rodar duas vezes não duplica nada (id existente é
 * pulado).
 *
 * Uso: npx tsx scripts/restaura-backup-lancamentos.ts backups/<arquivo>.json
 *      npx tsx scripts/restaura-backup-lancamentos.ts backups/<arquivo>.json --apply
 */

const APPLY = process.argv.includes("--apply");
const file = process.argv[2];

type Backup = {
  removedAt: string;
  table: string;
  rows: Record<string, unknown>[];
};

async function main() {
  if (!file || file.startsWith("--")) {
    console.error("uso: npx tsx scripts/restaura-backup-lancamentos.ts <arquivo.json> [--apply]");
    process.exitCode = 1;
    return;
  }
  const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;
  if (backup.table !== "MonthlyEntry") {
    console.error(`ABORTA: este script só restaura MonthlyEntry, o arquivo é de ${backup.table}.`);
    process.exitCode = 1;
    return;
  }

  const ids = backup.rows.map((r) => String(r.id));
  const existentes = await prisma.monthlyEntry.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const jaLa = new Set(existentes.map((e) => e.id));
  const faltando = backup.rows.filter((r) => !jaLa.has(String(r.id)));
  const cents = faltando.reduce((a, r) => a + decimalToCents(String(r.plannedAmount)), 0);

  console.log(`Backup de ${backup.removedAt}: ${backup.rows.length} linhas`);
  console.log(`Já no banco: ${jaLa.size} · a restaurar: ${faltando.length} (${formatCents(cents)})`);

  if (faltando.length === 0) return console.log("Nada a fazer.");
  if (!APPLY) return console.log("\nSimulação. Nada foi gravado — rode com --apply para valer.");

  const data = faltando.map((r) => ({
    id: String(r.id),
    itemId: (r.itemId as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    purchaseDate: r.purchaseDate ? new Date(String(r.purchaseDate)) : null,
    categoryId: (r.categoryId as string | null) ?? null,
    cardId: (r.cardId as string | null) ?? null,
    installmentId: (r.installmentId as string | null) ?? null,
    installmentSeq: (r.installmentSeq as number | null) ?? null,
    installmentCount: (r.installmentCount as number | null) ?? null,
    month: new Date(String(r.month)),
    plannedAmount: String(r.plannedAmount),
    paid: Boolean(r.paid),
    paidAmount: r.paidAmount == null ? null : String(r.paidAmount),
    paidDate: r.paidDate ? new Date(String(r.paidDate)) : null,
    reserveBoxId: (r.reserveBoxId as string | null) ?? null,
    withdrawalForId: (r.withdrawalForId as string | null) ?? null,
  }));
  const { count } = await prisma.monthlyEntry.createMany({ data, skipDuplicates: true });
  console.log(`Restaurados: ${count}`);
}

main().finally(() => prisma.$disconnect());
