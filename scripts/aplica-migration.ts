// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { prisma } from "@/lib/prisma";

/**
 * Aplica UMA migration pelo Prisma Client e a registra em `_prisma_migrations`.
 *
 *   npx tsx scripts/aplica-migration.ts 20260904220000_reserve_adjustment
 *   npx tsx scripts/aplica-migration.ts <nome> --dry-run
 *
 * Existe porque `prisma migrate deploy` não roda contra este banco: o pooler
 * do Supabase (6543, transaction mode) trava no advisory lock que o migrate
 * pede, e a porta direta 5432 do DIRECT_URL não é alcançável da máquina de
 * desenvolvimento. O Client passa pelo pooler sem problema.
 *
 * Limites, porque isto NÃO é o migrate:
 *   - roda os comandos um a um, sem transação em volta. Migration que falha no
 *     meio deixa a anterior aplicada — escreva os comandos idempotentes
 *     (IF NOT EXISTS) para poder repetir;
 *   - não valida checksum das migrations anteriores nem detecta drift;
 *   - divide o arquivo por `;` no fim da linha, então nada de `;` dentro de
 *     corpo de função ou string literal.
 *
 * Se um dia o acesso direto ao banco voltar, use `prisma migrate deploy`.
 */
async function main() {
  const name = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!name) {
    console.error("uso: npx tsx scripts/aplica-migration.ts <nome_da_migration> [--dry-run]");
    process.exitCode = 1;
    return;
  }
  const file = `prisma/migrations/${name}/migration.sql`;
  if (!existsSync(file)) {
    console.error(`não encontrei ${file}`);
    process.exitCode = 1;
    return;
  }

  const raw = readFileSync(file);
  const checksum = createHash("sha256").update(raw).digest("hex");
  const applied = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "_prisma_migrations" WHERE migration_name = $1`,
    name,
  );
  if (Number(applied[0].n) > 0) {
    console.log(`${name} já está registrada — nada a fazer.`);
    return;
  }

  const statements = raw
    .toString("utf8")
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);

  console.log(`${name}: ${statements.length} comandos${dryRun ? " (dry-run, nada será executado)" : ""}\n`);
  for (const [i, sql] of statements.entries()) {
    const resumo = sql.slice(0, 70).replace(/\s+/g, " ");
    if (dryRun) {
      console.log(`  ${i + 1}. ${resumo}…`);
      continue;
    }
    const linhas = await prisma.$executeRawUnsafe(sql);
    console.log(`  ${i + 1}. ok (${linhas}) ${resumo}…`);
  }
  if (dryRun) return;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, now(), $3, NULL, NULL, now(), $4)`,
    randomUUID(),
    checksum,
    name,
    statements.length,
  );
  console.log(`\n${name} aplicada e registrada.`);
}

main().finally(() => prisma.$disconnect());
