/**
 * Regras puras para provisionar e manter instâncias (um schema Postgres por pessoa,
 * no mesmo banco). Sem I/O, sem process.env, sem Prisma — só lógica, para ser testável
 * sem banco. Os scripts que fazem o trabalho de verdade (scripts/provisiona-instancia.ts
 * e scripts/atualiza-instancias.ts) consomem estas funções.
 *
 * `assertSchemaName` é a ÚNICA defesa contra injeção de SQL neste fluxo: o provisionador
 * monta `CREATE SCHEMA <nome>` por interpolação de string, com o nome vindo de process.argv.
 * Postgres não aceita parâmetro vinculado ($1, $2...) em DDL, então não existe "bind seguro"
 * para salvar — a segurança tem que vir de recusar, ANTES de interpolar, qualquer nome que não
 * seja exatamente um identificador da lista de permitidos. Escapar aspas NÃO é alternativa
 * aceitável aqui (não há escaping padrão e seguro para identificador de DDL em Postgres).
 * Por isso a regex abaixo é deliberadamente fechada: só minúsculas, dígitos e underscore,
 * começando por letra ou underscore. Não a afrouxe para aceitar mais caracteres.
 */
const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function assertSchemaName(name: string): string {
  if (name === "public") {
    throw new Error(
      'Nome de schema recusado: "public" é o schema do dono — provisionar sobre ele mexeria nos dados reais dele.'
    );
  }
  if (!SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error(
      `Nome de schema inválido: "${name}" — use apenas letras minúsculas, dígitos e underscore, começando por letra ou underscore (ex.: "ana", "ana_2").`
    );
  }
  return name;
}

export function pendingMigrations(all: string[], applied: string[]): string[] {
  const appliedSet = new Set(applied);
  return all.filter((migration) => !appliedSet.has(migration));
}

export function parseInstanceSchemas(raw: string | undefined): string[] {
  if (!raw) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function envBlock(opts: {
  schema: string;
  appName: string;
  appUrl: string;
  password: string;
  authSecret: string;
}): string {
  const { schema, appName, appUrl, password, authSecret } = opts;
  return [
    `DATABASE_SCHEMA=${schema}`,
    `APP_NAME=${appName}`,
    `APP_URL=${appUrl}`,
    `APP_PASSWORD=${password}`,
    `AUTH_SECRET=${authSecret}`,
  ].join("\n");
}
