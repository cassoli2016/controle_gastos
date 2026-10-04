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
 * Um schema listado que nunca foi provisionado (não tem a tabela de controle
 * `_prisma_migrations`) é verificado ANTES de tentar aplicar qualquer coisa,
 * via `schemaIsProvisioned` (só leitura, não cria a tabela — criar aqui
 * transformaria este script num provisionador pela porta dos fundos) e
 * reportado como categoria própria ("schema não provisionado"), não
 * misturado com "migration falhou" — senão quem lê o relatório sai caçando
 * problema na migration quando a causa real é que a cópia nunca existiu.
 * Conta como falha para o código de saída, mas aparece separado no relatório.
 *
 * Conexão só pela DATABASE_URL (pooler), nunca pela DIRECT_URL — mesma
 * regra do provisionador.
 *
 * Falha (ou "não provisionado") num schema não interrompe os outros: cada
 * schema roda dentro do seu próprio try/catch, o relatório final lista quem
 * falhou/não foi provisionado e por quê, e o código de saída é diferente de
 * zero se algum dos dois aconteceu.
 */

import { assertSchemaName, parseInstanceSchemas } from "@/lib/instance-schema";
import { applyPending, listAllMigrations, schemaIsProvisioned } from "@/scripts/provisiona-instancia";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(`--${flag}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

type Resultado =
  | { schema: string; estado: "ok"; n: number }
  | { schema: string; estado: "nao-provisionado" }
  | { schema: string; estado: "falhou"; erro: string };

function resumoOk(n: number, dryRun: boolean): string {
  if (n === 0) return "em dia";
  return dryRun ? `${n} pendente(s)` : `${n} aplicada(s)`;
}

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

      // Checagem só de leitura, ANTES de tentar aplicar qualquer migration —
      // ver nota de cabeçalho sobre por que isso não pode virar "migration
      // falhou" nem criar a tabela por conta própria.
      if (!(await schemaIsProvisioned(schema))) {
        resultados.push({ schema, estado: "nao-provisionado" });
        console.log(
          `[${schema}] schema não provisionado — rode \`npm run instancia:nova ${schema}\` primeiro`,
        );
        continue;
      }

      const n = await applyPending(schema, allMigrations, dryRun);
      resultados.push({ schema, estado: "ok", n });
      console.log(`[${schema}] ${resumoOk(n, dryRun)}`);
    } catch (err) {
      const erro = (err as Error).message;
      resultados.push({ schema: bruto, estado: "falhou", erro });
      console.error(`[${bruto}] FALHOU: ${erro}`);
    }
  }

  const sucessos = resultados.filter((r) => r.estado === "ok") as Extract<Resultado, { estado: "ok" }>[];
  const naoProvisionados = resultados.filter((r) => r.estado === "nao-provisionado");
  const falhas = resultados.filter((r) => r.estado === "falhou") as Extract<Resultado, { estado: "falhou" }>[];
  const totalAplicadas = sucessos.reduce((soma, r) => soma + r.n, 0);

  console.log("\nRelatório final:");
  for (const r of resultados) {
    if (r.estado === "ok") {
      console.log(`  OK                ${r.schema}: ${resumoOk(r.n, dryRun)}`);
    } else if (r.estado === "nao-provisionado") {
      console.log(`  NAO PROVISIONADO  ${r.schema}: rode \`npm run instancia:nova ${r.schema}\` primeiro`);
    } else {
      console.log(`  FALHOU            ${r.schema}: ${r.erro}`);
    }
  }
  console.log(
    `\n${resultados.length} schema(s) processado(s), ${sucessos.length} ok, ` +
      `${naoProvisionados.length} não provisionado(s), ${falhas.length} falha(s)` +
      (dryRun ? `, ${totalAplicadas} migration(s) pendente(s) no total.` : `, ${totalAplicadas} migration(s) aplicada(s) no total.`),
  );

  if (naoProvisionados.length > 0 || falhas.length > 0) {
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
