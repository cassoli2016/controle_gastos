// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Remove a série semanal ANTIGA da Diarista nos 9 meses em que ela convive com
 * a nova, para rodar UMA vez.
 *
 * A cadência de 2x por semana sempre esteve certa. O que havia eram duas séries
 * no mesmo mês: a válida (installmentId ...67087ee9, de 2027-07 a 2029-12) e a
 * antiga (...4bd32f30), que devia ter parado em 2027-06 e reaparecia por causa
 * do "Copiar mês do ano passado" — ele conferia se AQUELE installmentId já
 * estava no destino em vez de perguntar pela conta. Corrigido no código na
 * v1.18.0 (`weeklyGroupAlreadyIn`); isto limpa o que ficou.
 *
 * Nesses meses cada data aparece duas vezes e o mês cobra R$ 3.960 em vez de
 * R$ 1.980. Depois da limpeza, lançamentos = datas, como nos outros 33 meses.
 *
 * Antes de apagar, grava um backup JSON com as linhas inteiras em
 * `backups/diarista-duplicada-<timestamp>.json`. Para desfazer:
 * `npx tsx scripts/restaura-backup-lancamentos.ts <arquivo>`.
 *
 * Confere o estado contra o medido antes de gravar; se o banco não estiver
 * como esperado, aborta em vez de adivinhar (o app é usado ao vivo).
 *
 * Uso: npx tsx scripts/limpa-diarista-duplicada.ts           (simula)
 *      npx tsx scripts/limpa-diarista-duplicada.ts --apply   (grava)
 */

const APPLY = process.argv.includes("--apply");

/** Sufixo do installmentId da série antiga — a que sai. */
const OLD_SERIES = "4bd32f30";
/** Os únicos meses em que as duas séries convivem. */
const MONTHS = [
  "2027-09",
  "2028-01",
  "2028-05",
  "2028-06",
  "2028-09",
  "2029-01",
  "2029-05",
  "2029-06",
  "2029-09",
];
/** Medido em 04/09/2026, antes de gravar. */
const EXPECTED_ROWS = 78;
const EXPECTED_CENTS = 1716000;

async function main() {
  const rows = await prisma.monthlyEntry.findMany({
    where: {
      description: { contains: "Diarista" },
      month: { in: MONTHS.map(monthToDate) },
    },
    orderBy: [{ month: "asc" }, { purchaseDate: "asc" }],
  });

  const sai = rows.filter((r) => r.installmentId?.endsWith(OLD_SERIES));
  const cents = sai.reduce((a, r) => a + decimalToCents(String(r.plannedAmount)), 0);

  console.log(`Diarista nesses 9 meses: ${rows.length} lançamentos · série antiga: ${sai.length}`);
  console.log(`Valor a remover: ${formatCents(cents)}\n`);

  // ── Guardas: o app é usado ao vivo, então nada de adivinhar ───────────────
  if (sai.length !== EXPECTED_ROWS) {
    console.error(`ABORTA: esperava ${EXPECTED_ROWS} linhas da série antiga, achei ${sai.length}.`);
    process.exitCode = 1;
    return;
  }
  if (cents !== EXPECTED_CENTS) {
    console.error(`ABORTA: esperava ${formatCents(EXPECTED_CENTS)}, achei ${formatCents(cents)}.`);
    process.exitCode = 1;
    return;
  }
  const pagos = sai.filter((r) => r.paid);
  if (pagos.length > 0) {
    console.error(`ABORTA: ${pagos.length} linha(s) da série antiga estão PAGAS — isso é histórico.`);
    process.exitCode = 1;
    return;
  }
  // Cada mês tem de ficar com pelo menos uma diarista por data: se a série
  // nova não estiver lá, apagar a antiga deixaria o mês sem diarista nenhuma.
  for (const m of MONTHS) {
    const doMes = rows.filter((r) => monthStringFromDate(r.month) === m);
    const fica = doMes.filter((r) => !r.installmentId?.endsWith(OLD_SERIES));
    const vai = doMes.filter((r) => r.installmentId?.endsWith(OLD_SERIES));
    if (fica.length === 0 || fica.length !== vai.length) {
      console.error(`ABORTA em ${m}: ficariam ${fica.length} e sairiam ${vai.length} — não é o par exato.`);
      process.exitCode = 1;
      return;
    }
    const centsMes = vai.reduce((a, r) => a + decimalToCents(String(r.plannedAmount)), 0);
    console.log(`  ${m}: ${doMes.length} → ${fica.length} lançamentos (sai ${formatCents(centsMes)})`);
  }

  if (!APPLY) {
    console.log("\nSimulação. Nada foi gravado — rode com --apply para valer.");
    return;
  }

  // ── Backup antes de apagar ────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `backups/diarista-duplicada-${stamp}.json`;
  mkdirSync("backups", { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      { removedAt: new Date().toISOString(), table: "MonthlyEntry", rows: sai },
      (_k, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ),
  );
  console.log(`\nBackup: ${file} (${sai.length} linhas)`);

  const { count } = await prisma.monthlyEntry.deleteMany({ where: { id: { in: sai.map((r) => r.id) } } });
  console.log(`Removidos: ${count}`);

  // ── Confere o resultado ───────────────────────────────────────────────────
  const depois = await prisma.monthlyEntry.findMany({
    where: { description: { contains: "Diarista" }, month: { in: MONTHS.map(monthToDate) } },
  });
  console.log("\nDepois:");
  for (const m of MONTHS) {
    const doMes = depois.filter((r) => monthStringFromDate(r.month) === m);
    const datas = new Set(doMes.map((r) => r.purchaseDate?.toISOString().slice(0, 10)));
    const total = doMes.reduce((a, r) => a + decimalToCents(String(r.plannedAmount)), 0);
    const ok = doMes.length === datas.size ? "✓" : "✗ ainda há data repetida";
    console.log(`  ${m}: ${doMes.length} lançamentos em ${datas.size} datas · ${formatCents(total)} ${ok}`);
  }
}

main().finally(() => prisma.$disconnect());
