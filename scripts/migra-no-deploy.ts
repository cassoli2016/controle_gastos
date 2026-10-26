// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

/**
 * Roda antes do `next build` (script `build` do package.json): no deploy de
 * produção de uma cópia, aplica no schema DELA as migrations que faltam. É o
 * `npm run instancia:atualiza` acontecendo sozinho, um schema por deploy —
 * cada projeto da Vercel cuida do seu, com a DATABASE_URL e o DATABASE_SCHEMA
 * que já tem.
 *
 * Quem decide se migra e onde é `deployMigrationTarget`
 * (lib/instance-schema.ts). O mecanismo é o mesmo `applyPending` do
 * provisionador (transação por migration, por causa do pgbouncer).
 *
 * Falhar aqui falha o build de propósito: a Vercel mantém no ar o deploy
 * anterior, cujo código ainda bate com o schema antigo. Subir o código novo
 * sobre um schema atrasado é o que quebrava as telas da cópia.
 *
 * Schema não provisionado também falha: a cópia nunca funcionaria sem ele, e
 * criá-lo aqui faria do build um provisionador pela porta dos fundos.
 */

import { deployMigrationTarget } from "@/lib/instance-schema";
import { applyPending, listAllMigrations, schemaIsProvisioned } from "@/scripts/provisiona-instancia";

async function main() {
  const { VERCEL_ENV, DATABASE_SCHEMA } = process.env;
  const alvo = deployMigrationTarget({ VERCEL_ENV, DATABASE_SCHEMA });
  if ("skip" in alvo) {
    console.log(`migra-no-deploy: nada a fazer (${alvo.skip}).`);
    return;
  }
  const { schema } = alvo;
  if (!(await schemaIsProvisioned(schema))) {
    throw new Error(`schema "${schema}" não provisionado — rode \`npm run instancia:nova ${schema}\` primeiro`);
  }
  const n = await applyPending(schema, listAllMigrations(), false);
  console.log(`migra-no-deploy: schema "${schema}" ${n === 0 ? "em dia" : `com ${n} migration(s) aplicada(s)`}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("migra-no-deploy falhou — build interrompido, o deploy anterior segue no ar:", (e as Error).message);
    process.exit(1);
  });
