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
 *
 * Também barramos nome com mais de 63 caracteres (limite de identificador do Postgres).
 * O risco aqui NÃO é um erro de sintaxe — é pior: o Postgres trunca identificador longo
 * demais em silêncio, sem avisar de um jeito que um script perceba. Dois nomes de instância
 * que só diferem depois do caractere 63 truncariam para o MESMO nome de schema, ou seja,
 * duas pessoas diferentes passariam a compartilhar um schema — dados financeiros de uma
 * pessoa vazando para a tela da outra. Isso é exatamente o que "um schema por pessoa" existe
 * para impedir, então o limite entra aqui, não só como corte de edge case. Como a regex acima
 * só permite ASCII de `[a-z0-9_]`, `.length` já é contagem de bytes — não precisa medir UTF-8.
 *
 * Palavra reservada do SQL (ex.: "select", "table") FICA aceita de propósito: o provisionador
 * monta `CREATE SCHEMA IF NOT EXISTS "${schema}"` com o nome entre aspas duplas
 * (scripts/provisiona-instancia.ts), e "select" é um identificador legal entre aspas — não há
 * diferença prática para o Postgres. Manter uma lista de palavras reservadas para recusar aqui
 * seria uma lista que envelhece (o Postgres muda a lista entre versões) e ainda assim nunca
 * cobre tudo. O caso que de fato importava — um schema que já existe e levaria as migrations
 * da cópia nova para dentro dele — está barrado explicitamente abaixo (schema gerenciado do
 * Supabase e `public`), não por recusa de palavra reservada.
 */
const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;
const MAX_SCHEMA_NAME_LENGTH = 63;

/**
 * Schemas que o Supabase já cria e gerencia no mesmo banco. Passam na regex
 * (são identificadores válidos) e já EXISTEM antes de qualquer provisionamento
 * — o que faria `CREATE SCHEMA IF NOT EXISTS` virar no-op silencioso e as 28
 * migrations da cópia nova serem aplicadas dentro do schema do Supabase, não
 * num schema novo da pessoa.
 */
const SUPABASE_MANAGED_SCHEMAS = new Set([
  "auth",
  "storage",
  "realtime",
  "extensions",
  "vault",
  "graphql",
  "supabase_functions",
]);

export function assertSchemaName(name: string): string {
  if (name === "public") {
    throw new Error(
      'Nome de schema recusado: "public" é o schema do dono — provisionar sobre ele mexeria nos dados reais dele.'
    );
  }
  if (SUPABASE_MANAGED_SCHEMAS.has(name)) {
    throw new Error(
      `Nome de schema recusado: "${name}" é um schema gerenciado do Supabase — já existe no banco, e provisionar sobre ele aplicaria as migrations da cópia nova dentro dele em vez de um schema novo.`
    );
  }
  if (!SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error(
      `Nome de schema inválido: "${name}" — use apenas letras minúsculas, dígitos e underscore, começando por letra ou underscore (ex.: "ana", "ana_2").`
    );
  }
  if (name.length > MAX_SCHEMA_NAME_LENGTH) {
    throw new Error(
      `Nome de schema inválido: "${name}" tem ${name.length} caracteres — o limite de identificador do Postgres é ${MAX_SCHEMA_NAME_LENGTH}. Acima disso o Postgres trunca em silêncio, e dois nomes diferentes poderiam colidir no mesmo schema. Use um nome com até ${MAX_SCHEMA_NAME_LENGTH} caracteres.`
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
