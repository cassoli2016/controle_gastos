/**
 * Prepara o banco dos testes e2e: recria do zero o schema Postgres "e2e"
 * (isolado do "public", onde vivem os dados reais), aplica as migrations e
 * semeia dados determinísticos num mês fixo (2030-01).
 *
 * Roda com DATABASE_SCHEMA=e2e (definido no playwright.config.ts).
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA = "e2e";
export const E2E_MONTH = "2030-01";

async function main() {
  const direct = process.env.DIRECT_URL;
  const pooled = process.env.DATABASE_URL;
  if (!direct || !pooled) throw new Error("DIRECT_URL/DATABASE_URL ausentes");

  // 1. Recria o schema e2e do zero (nunca toca o public).
  const admin = new Client({ connectionString: direct });
  await admin.connect();
  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.end();
  console.log(`schema ${SCHEMA} dropado`);

  // 2. Aplica as migrations no schema e2e (DIRECT_URL com ?schema=e2e).
  // A conexão direta do Supabase falha esporadicamente com P1001; retenta.
  const sep = direct.includes("?") ? "&" : "?";
  const migrateEnv = { ...process.env, DIRECT_URL: `${direct}${sep}schema=${SCHEMA}` };
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync("npx prisma migrate deploy", { stdio: "inherit", env: migrateEnv });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.log(`migrate deploy falhou (tentativa ${attempt}/3), aguardando...`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  if (lastErr) throw lastErr;

  // 3. Semeia dados determinísticos.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: pooled }, { schema: SCHEMA }),
  });
  const renda = await prisma.category.create({ data: { name: "Renda", type: "INCOME", color: "#22c55e" } });
  const moradia = await prisma.category.create({ data: { name: "Moradia", type: "EXPENSE", color: "#3b82f6" } });
  const salario = await prisma.item.create({ data: { name: "SALÁRIO", categoryId: renda.id, dueDay: 7 } });
  const aluguel = await prisma.item.create({ data: { name: "ALUGUEL", categoryId: moradia.id, dueDay: 5 } });
  const month = new Date(Date.UTC(2030, 0, 1));
  await prisma.monthlyEntry.createMany({
    data: [
      { itemId: salario.id, month, plannedAmount: 10000 },
      { itemId: aluguel.id, month, plannedAmount: 2000 },
    ],
  });
  await prisma.$disconnect();
  console.log(`seed ok (${E2E_MONTH}: SALÁRIO 10000 / ALUGUEL 2000)`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("e2e-reset-db falhou:", (e as Error).message.split("\n")[0]);
  process.exit(1);
});
