// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

/**
 * Aplica, em cada schema de instância JÁ PROVISIONADA, as migrations que
 * ainda faltam — a parte do banco que o `push` na `main` não resolve
 * sozinho (o código redeploya em todas as cópias; o schema de cada uma,
 * não).
 *
 *   npx tsx scripts/atualiza-instancias.ts [--dry-run]
 *   npx tsx scripts/atualiza-instancias.ts [--dry-run] --schema <nome>
 *
 * Sem `--schema`, a lista de schemas vem de `INSTANCE_SCHEMAS` (variável de
 * ambiente, separada por vírgula — `parseInstanceSchemas` em
 * lib/instance-schema.ts). Com `--schema`, age só naquele nome, ignorando
 * `INSTANCE_SCHEMAS`.
 *
 * Todo o mecanismo de aplicar migration (ler o que já está registrado,
 * calcular pendência, aplicar cada uma dentro de `BEGIN`/`SET LOCAL
 * search_path`/`COMMIT` por causa do pgbouncer em modo transação) é
 * `applyPending`, importada de `scripts/provisiona-instancia.ts` — ver o
 * cabeçalho daquele arquivo para o motivo da transação por migration. Este
 * script não duplica essa lógica; só decide A LISTA de schemas, chama
 * `applyPending` para cada um e agrega o relatório final.
 *
 * REGRA NÃO-NEGOCIÁVEL: cada nome de schema passa por `assertSchemaName`
 * ANTES de ir para `applyPending` (que por sua vez revalida de novo, como
 * rede de segurança — ver o cabeçalho de `provisiona-instancia.ts`). O nome
 * vem de fora (env ou `--schema`), então nunca é confiável por si só.
 *
 * Este script NUNCA cria schema (quem provisiona uma instância nova é
 * `scripts/provisiona-instancia.ts`) e NUNCA derruba schema — nem com flag.
 * Um schema que não existe simplesmente aparece com todas as migrations
 * como pendentes (mesmo comportamento de "instância nova" que
 * `readAppliedMigrations` já tem) — mas sem `--dry-run` isso falharia ao
 * tentar aplicar a primeira migration contra um schema inexistente, e o
 * erro apareceria no relatório como falha DAQUELE schema, sem afetar os
 * outros.
 *
 * Conexão só pela DATABASE_URL (pooler), nunca pela DIRECT_URL — mesma
 * regra do provisionador.
 *
 * Falha num schema não interrompe os outros: cada schema roda dentro do seu
 * próprio try/catch, o relatório final lista quem falhou e por quê, e o
 * código de saída é diferente de zero se algum falhou.
 */

import { assertSchemaName, parseInstanceSchemas } from "@/lib/instance-schema";
import { applyPending, listAllMigrations } from "@/scripts/provisiona-instancia";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(`--${flag}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

type Resultado =
  | { schema: string; ok: true; n: number }
  | { schema: string; ok: false; erro: string };

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const schemaFlag = argValue("schema");

  const schemasBrutos = schemaFlag ? [schemaFlag] : parseInstanceSchemas(process.env.INSTANCE_SCHEMAS);

  if (schemasBrutos.length === 0) {
    console.log(
      "nenhuma instância configurada (INSTANCE_SCHEMAS vazio e nenhum --schema) — nada a fazer.",
    );
    return;
  }

  const allMigrations = listAllMigrations();
  const resultados: Resultado[] = [];

  for (const bruto of schemasBrutos) {
    try {
      // REGRA NÃO-NEGOCIÁVEL: valida ANTES de qualquer uso — nome vindo de
      // INSTANCE_SCHEMAS ou --schema não é confiável por si só.
      const schema = assertSchemaName(bruto);
      const n = await applyPending(schema, allMigrations, dryRun);
      resultados.push({ schema, ok: true, n });
      const resumo = n === 0 ? "em dia" : dryRun ? `${n} pendente(s)` : `${n} aplicada(s)`;
      console.log(`[${schema}] ${resumo}`);
    } catch (err) {
      const erro = (err as Error).message;
      resultados.push({ schema: bruto, ok: false, erro });
      console.error(`[${bruto}] FALHOU: ${erro}`);
    }
  }

  const falhas = resultados.filter((r): r is Extract<Resultado, { ok: false }> => !r.ok);
  const sucessos = resultados.filter((r): r is Extract<Resultado, { ok: true }> => r.ok);
  const totalAplicadas = sucessos.reduce((soma, r) => soma + r.n, 0);

  console.log("\nRelatório final:");
  for (const r of resultados) {
    console.log(
      r.ok
        ? `  OK      ${r.schema}: ${r.n === 0 ? "em dia" : dryRun ? `${r.n} pendente(s)` : `${r.n} aplicada(s)`}`
        : `  FALHOU  ${r.schema}: ${r.erro}`,
    );
  }
  console.log(
    `\n${resultados.length} schema(s) processado(s), ${sucessos.length} ok, ${falhas.length} falha(s)` +
      (dryRun ? `, ${totalAplicadas} migration(s) pendente(s) no total.` : `, ${totalAplicadas} migration(s) aplicada(s) no total.`),
  );

  if (falhas.length > 0) {
    process.exitCode = 1;
  }
}

main()
  // `process.exit(0)` ignoraria um `process.exitCode` setado antes (ex.: algum
  // schema falhou) — preserva o que já estiver setado em vez de forçar 0.
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("atualiza-instancias falhou:", (e as Error).message);
    process.exit(1);
  });
