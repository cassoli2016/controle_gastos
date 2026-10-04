// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

/**
 * Provisiona uma instância nova: cria o schema Postgres de uma pessoa, aplica
 * nele as migrations que faltam e imprime as variáveis para colar na Vercel.
 *
 *   npx tsx scripts/provisiona-instancia.ts <schema> [--dry-run]
 *   npx tsx scripts/provisiona-instancia.ts <schema> [--app-name="Nome"] [--app-url="https://..."]
 *
 * Em ordem: `assertSchemaName` (recusa ANTES de qualquer interpolação) →
 * `CREATE SCHEMA IF NOT EXISTS` → lê os nomes de `prisma/migrations` → lê os
 * já registrados em `<schema>._prisma_migrations` (vazio se a tabela não
 * existir) → `pendingMigrations` → aplica e registra cada uma que falta →
 * imprime `envBlock` com `APP_PASSWORD`/`AUTH_SECRET` novos
 * (`crypto.randomBytes(32).toString("base64url")`).
 *
 * `--dry-run` faz só leitura (lista o que está pendente) e não executa
 * NENHUM comando de escrita: não cria schema, não aplica migration.
 *
 * Este script NUNCA derruba schema — nem com flag, nem com confirmação. Quem
 * faz DROP SCHEMA é `scripts/e2e-reset-db.ts`, de propósito separado deste
 * arquivo: ali o drop é o certo (ambiente de teste, descartável); aqui seria
 * catastrófico (schema de uma pessoa de verdade). Os dois não compartilham
 * código por isso — o drop não deve ter como "vazar" para este arquivo.
 *
 * Conexão só pela DATABASE_URL (pooler, pgbouncer em modo transação, porta
 * 6543). NUNCA pela DIRECT_URL: a porta direta do Supabase não é alcançável
 * desta máquina — ver o cabeçalho de `scripts/aplica-migration.ts`.
 *
 * Reaproveita de `aplica-migration.ts` a mesma divisão de arquivo por `;` no
 * fim da linha e a mesma falta de validação de checksum das migrations
 * anteriores (não detecta drift).
 *
 * DIFERENÇA deliberada em relação a `aplica-migration.ts`: aqui cada
 * migration roda dentro de `BEGIN` / `SET LOCAL search_path` / `COMMIT`, em
 * vez de solta como lá. `aplica-migration.ts` nunca precisou disso porque só
 * aplica contra o schema "public" (o default de qualquer conexão nova, sem
 * precisar setar nada). Este script aplica contra um schema arbitrário, e os
 * arquivos de migration.sql NÃO qualificam o schema (ex.: `CREATE TABLE
 * "Category"`, sem prefixo) — contam com o search_path da conexão. Como a
 * conexão passa pelo pgbouncer em MODO TRANSAÇÃO, um `SET search_path` solto
 * não é confiável: o pgbouncer pode trocar a conexão física de backend entre
 * dois comandos que não fazem parte da MESMA transação, e o search_path
 * setado ficaria no backend errado. Dentro de uma transação explícita
 * (BEGIN...COMMIT), o pgbouncer garante o mesmo backend do início ao fim —
 * é esse o contrato do modo transação. Por isso cada migration vira uma
 * transação: se falhar no meio, dá ROLLBACK só dela; as migrations
 * anteriores já commitadas permanecem aplicadas, e o script para e diz
 * exatamente em qual migration parou.
 *
 * `applyPending` (exportada) é o miolo desse mecanismo — ler o que já está
 * aplicado, calcular o que falta (`pendingMigrations`) e aplicar cada
 * pendência na transação acima — isolado do `CREATE SCHEMA`/criação da
 * tabela de controle (que só faz sentido para uma instância nova). Existe
 * para ser reusada por `scripts/atualiza-instancias.ts` (Task 6), que roda
 * contra instâncias JÁ provisionadas e nunca cria schema. `applyPending`
 * abre e fecha sua PRÓPRIA conexão (não reaproveita a do `main` deste
 * arquivo) porque seu contrato não inclui um `Client` como parâmetro — isso
 * deixa cada chamada (cada schema, no caso de `atualiza-instancias.ts`)
 * isolada: a conexão de um schema não interfere na de outro. Dentro dela,
 * revalida `assertSchemaName` de novo antes de interpolar, mesmo que todo
 * chamador interno já valide — rede de segurança para qualquer chamador
 * futuro que esqueça.
 *
 * `schemaIsProvisioned` (exportada, fix round 1 da Task 6) é uma checagem só
 * de leitura separada de `applyPending`: diz se o schema já tem a tabela
 * `_prisma_migrations`, sem tentar aplicar nada. `atualiza-instancias.ts` usa
 * isso para reportar "schema não provisionado" como categoria própria, em vez
 * de deixar a primeira migration falhar e parecer um problema NA migration.
 */

import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { Client } from "pg";
import { assertSchemaName, pendingMigrations, envBlock } from "@/lib/instance-schema";

const MIGRATIONS_DIR = "prisma/migrations";

export function listAllMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// Mesma divisão de `aplica-migration.ts`: por `;` no fim da linha, descartando
// comentários `--`. Não lida com `;` dentro de corpo de função ou string.
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter(Boolean);
}

async function readAppliedMigrations(client: Client, schema: string): Promise<string[]> {
  try {
    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "${schema}"."_prisma_migrations"`,
    );
    return rows.map((r) => r.migration_name);
  } catch (err) {
    // "42P01" é o código SQLSTATE do Postgres para undefined_table: schema ou
    // tabela realmente não existem — instância nova, nada aplicado ainda.
    // Qualquer OUTRO erro (conexão caiu, permissão negada, etc.) NÃO pode
    // virar silenciosamente "nada aplicado" — isso mascararia um problema
    // real atrás de um resultado que parece normal (achado do revisor da
    // Task 5; passou a importar de verdade na Task 6, fix round 1: o estado
    // "schema não provisionado" de atualiza-instancias.ts precisa distinguir
    // as duas situações sem ambiguidade — ver `schemaIsProvisioned` abaixo,
    // que por isso NÃO reusa esta função).
    if ((err as { code?: string }).code === "42P01") {
      return [];
    }
    throw err;
  }
}

function requireConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ausente no .env — este script conecta só pelo pooler, nunca pela DIRECT_URL.",
    );
  }
  return connectionString;
}

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length);
}

/**
 * Só leitura: diz se `schema` já foi provisionado (tem a tabela de controle
 * `_prisma_migrations`), SEM criar nada. Existe para `atualiza-instancias.ts`
 * reportar "schema não provisionado" como categoria própria, em vez de deixar
 * a primeira migration falhar com um erro de SQL que pareceria problema na
 * migration. Consulta `information_schema.tables` (não dá `SELECT` na tabela
 * em si) — cobre tanto "a tabela não existe" quanto "o schema inteiro não
 * existe" com a mesma query, sem precisar de tratamento especial para cada
 * caso: as duas situações têm zero linhas na mesma consulta.
 *
 * Deliberadamente NÃO reusa `readAppliedMigrations`: aquela função decide
 * "nada aplicado" só a partir de capturar um erro de SQL, e mesmo filtrando
 * pelo código `42P01` ela ainda é uma inferência indireta. Esta função
 * pergunta ao catálogo diretamente, então uma queda de conexão ou erro de
 * permissão aqui propaga como exceção de verdade — nunca vira "não
 * provisionado" por engano.
 */
export async function schemaIsProvisioned(schema: string): Promise<boolean> {
  // Mesma rede de segurança de `applyPending`: revalida mesmo que o chamador
  // já tenha validado.
  const validSchema = assertSchemaName(schema);
  const connectionString = requireConnectionString();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = '_prisma_migrations'
       ) AS existe`,
      [validSchema],
    );
    return rows[0]?.existe ?? false;
  } finally {
    await client.end();
  }
}

/**
 * Aplica, num `schema` já existente, as migrations de `nomes` que ainda não
 * estão em `<schema>._prisma_migrations`. NÃO cria schema nem a tabela de
 * controle — isso é responsabilidade de quem provisiona uma instância nova
 * (`main` deste arquivo, antes de chamar esta função). `dryRun` só lê e
 * relata; devolve sempre a contagem de migrations pendentes/aplicadas.
 *
 * Abre e fecha sua própria conexão (um `Client` por chamada) — ver nota no
 * cabeçalho do arquivo sobre por quê.
 */
export async function applyPending(schema: string, nomes: string[], dryRun: boolean): Promise<number> {
  // Revalida mesmo que todo chamador atual já tenha validado antes de montar
  // `schema` — ver REGRA NÃO-NEGOCIÁVEL no cabeçalho do arquivo. `assertSchemaName`
  // é pura e devolve o mesmo valor para um nome já válido, então isto não muda
  // nada para quem já valida; só fecha a porta para quem esquecer.
  const validSchema = assertSchemaName(schema);

  const connectionString = requireConnectionString();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const applied = await readAppliedMigrations(client, validSchema);
    const pending = pendingMigrations(nomes, applied);

    if (dryRun) {
      console.log(
        `[dry-run] schema "${validSchema}": ${applied.length} migration(s) já registrada(s), ` +
          `${pending.length} pendente(s) de ${nomes.length} no total:`,
      );
      for (const name of pending) console.log(`  - ${name}`);
      console.log("\n[dry-run] nada foi executado (nenhum CREATE SCHEMA, nenhuma migration aplicada).");
      return pending.length;
    }

    if (pending.length === 0) {
      console.log("0 migrations pendentes — nada a aplicar.");
      return 0;
    }

    console.log(`aplicando ${pending.length} migration(s) pendente(s):`);
    for (const name of pending) {
      const file = `${MIGRATIONS_DIR}/${name}/migration.sql`;
      if (!existsSync(file)) {
        throw new Error(`não encontrei ${file}`);
      }
      const raw = readFileSync(file);
      const checksum = createHash("sha256").update(raw).digest("hex");
      const statements = splitStatements(raw.toString("utf8"));

      await client.query("BEGIN");
      try {
        // search_path só vale dentro desta transação — ver nota de cabeçalho
        // sobre o pgbouncer em modo transação.
        await client.query(`SET LOCAL search_path TO "${validSchema}"`);
        for (const sql of statements) {
          await client.query(sql);
        }
        await client.query(
          `INSERT INTO "${validSchema}"."_prisma_migrations"
             (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, now(), $3, NULL, NULL, now(), $4)`,
          [randomUUID(), checksum, name, statements.length],
        );
        await client.query("COMMIT");
        console.log(`  ${name}: aplicada e registrada (${statements.length} comando(s))`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(
          `\nFalhou em "${name}" — ROLLBACK só dela. Migrations anteriores continuam aplicadas.`,
        );
        throw err;
      }
    }
    return pending.length;
  } finally {
    await client.end();
  }
}

async function main() {
  const schemaArg = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");

  if (!schemaArg || schemaArg.startsWith("--")) {
    console.error(
      "uso: npx tsx scripts/provisiona-instancia.ts <schema> [--dry-run] " +
        '[--app-name="Nome"] [--app-url="https://..."]',
    );
    process.exitCode = 1;
    return;
  }

  // REGRA NÃO-NEGOCIÁVEL: valida ANTES de qualquer interpolação. Daqui em
  // diante só `schema` (o valor validado e devolvido) entra em SQL — nunca
  // `schemaArg` de novo.
  const schema = assertSchemaName(schemaArg);

  const allMigrations = listAllMigrations();

  if (dryRun) {
    // Dry-run não cria nada — nem schema, nem tabela de controle — então não
    // há preparo a fazer aqui: `applyPending` sozinha já só lê e relata.
    await applyPending(schema, allMigrations, true);
    return;
  }

  const connectionString = requireConnectionString();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    // Schema novo não tem a tabela de controle do Prisma — ninguém além do
    // próprio `migrate` a cria normalmente, e aqui não tem `migrate` rodando.
    // DDL idêntica à que o Prisma usa (conferida contra o `public` real).
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      )
    `);
    console.log(`schema "${schema}": ok (criado agora ou já existia)`);
  } finally {
    await client.end();
  }

  await applyPending(schema, allMigrations, false);

  const password = randomBytes(32).toString("base64url");
  const authSecret = randomBytes(32).toString("base64url");
  const appName = argValue("app-name") ?? `<definir APP_NAME para "${schema}">`;
  const appUrl = argValue("app-url") ?? "<definir APP_URL (domínio da Vercel)>";

  console.log("\nVariáveis para colar na Vercel:\n");
  console.log(envBlock({ schema, appName, appUrl, password, authSecret }));
}

// `scripts/atualiza-instancias.ts` importa `applyPending`/`listAllMigrations`
// deste arquivo. Sem este guard, qualquer `import` deste módulo re-executaria
// `main()` com o `process.argv` de QUEM importou (foi exatamente o bug visto
// na verificação: `atualiza-instancias.ts` rodando sem schema na posição
// esperada por este `main`, caindo no "uso: ..." e saindo com código 1) —
// `require.main === module` só é verdadeiro quando este arquivo é o ponto de
// entrada (`npx tsx scripts/provisiona-instancia.ts ...`), nunca quando é
// importado por outro módulo.
if (require.main === module) {
  main()
    // `process.exit(0)` ignoraria um `process.exitCode` setado antes de um
    // `return` cedo (ex.: uso sem argumento) — por isso preserva o que já
    // estiver setado em vez de forçar 0.
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((e) => {
      console.error("provisiona-instancia falhou:", (e as Error).message);
      process.exit(1);
    });
}
