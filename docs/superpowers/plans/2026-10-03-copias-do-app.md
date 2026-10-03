# Cópias do app para outras pessoas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono monte uma cópia do app para outra pessoa — endereço, senha e schema próprios — sem vazar dado pessoal e sem tocar no código de acesso a dados.

**Architecture:** Uma base de código, N deploys na Vercel, N schemas Postgres no mesmo projeto Supabase. `lib/prisma.ts` já lê `DATABASE_SCHEMA`, então nenhuma consulta muda. O trabalho é tirar identidade e dado pessoal do código, e criar as ferramentas de provisionar e atualizar os schemas.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Postgres (Supabase), Vitest, tsx, Docker (só no smoke).

**Spec:** `docs/superpowers/specs/2026-10-03-copias-do-app-design.md`

## Global Constraints

- Toda Server Action nova passa por `guardAction` de `lib/action-guard.ts`.
- Script `tsx` começa com `import "dotenv/config"` na PRIMEIRA linha e envolve o corpo numa `async function main()` — o `tsx` deste projeto compila para cjs e recusa `await` no topo.
- Script avulso acessa o banco pelo **pooler** (`DATABASE_URL`). O `DIRECT_URL` não é alcançável da máquina de desenvolvimento; é por isso que `prisma migrate deploy` não roda aqui.
- Migration nova precisa ser idempotente (`IF NOT EXISTS`): o provisionador aplica comando a comando, sem transação em volta.
- Nenhum valor em reais e nenhum nome próprio de pessoa, conta ou empregador em `lib/changelog.ts`.
- A entrega final bumpa `version` no `package.json` (minor) e adiciona a entrada correspondente em `lib/changelog.ts`, no mesmo commit (AGENTS.md).
- Testes de lógica pura em `tests/*.test.ts`; nada que precise de banco entra no `npm test`.

## Review Focus

- **Nome de schema com aspas ou `;`** — `CREATE SCHEMA` monta SQL por interpolação; um nome vindo de `argv` precisa ser recusado antes, não escapado. Coberto na Task 4.
- **Schema `public` passado ao provisionador** — provisionar sobre o schema do dono mexeria nos dados reais; tem que ser recusa explícita. Coberto na Task 4.
- **Reexecutar o provisionador no mesmo schema** — deve pular as migrations já registradas em vez de reaplicar; a decisão é pura e precisa de teste próprio. Coberto na Task 4.
- **`APP_URL` com esquema, barra final ou ausente** — o rodapé do login não pode exibir `https://x.com/` nem um domínio vazio. Coberto na Task 2.
- **Entrada futura de changelog com valor em reais** — a guarda tem que falhar no `npm test`, não passar despercebida. Coberto na Task 1.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/branding.ts` (novo) | Lê `APP_NAME` e `APP_URL` e normaliza o domínio para exibição |
| `lib/instance-schema.ts` (novo) | Valida nome de schema e decide quais migrations faltam — puro, sem banco |
| `scripts/provisiona-instancia.ts` (novo) | Cria o schema, aplica as migrations, imprime as envs |
| `scripts/atualiza-instancias.ts` (novo) | Aplica migrations pendentes em todos os schemas conhecidos |
| `scripts/smoke-vazio.ts` (novo) | Sobe Postgres em Docker, aplica migrations, levanta o app, pede as 11 rotas |
| `docs/instancias.md` (novo) | Runbook: criar, entregar, atualizar, remover |
| `lib/changelog.ts` | Entradas reescritas sem dado pessoal |
| `lib/import-normalize.ts` | Regras de categoria sem nomes próprios |
| `app/layout.tsx`, `app/manifest.ts`, `app/(app)/LockScreen.tsx`, `app/(app)/novidades/page.tsx`, `app/(auth)/login/page.tsx`, `scripts/telegram-webhook.ts` | Passam a ler `lib/branding.ts` |
| `.env.example` | Contrato completo das variáveis |

---

### Task 1: Changelog sem dado pessoal

O item mais sério do spec: `/novidades` publicaria saldos, nomes de contas, de pessoas e do empregador do dono.

**Files:**
- Modify: `lib/changelog.ts` (todas as entradas)
- Test: `tests/changelog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada que outras tasks usem. `CHANGELOG` mantém o tipo `ChangelogEntry` atual.

- [ ] **Step 1: Escrever as guardas (falhando)**

Em `tests/changelog.test.ts`, no `describe("CHANGELOG")`:

```ts
const TERMOS_PESSOAIS = [
  "cassoli", "heitor", "audrey", "hana", "gobrax", "marcos nunes",
  "nucel", "ultravioleta", "franciscana", "psico",
];

it("nenhuma entrada expõe valor em reais", () => {
  for (const e of CHANGELOG)
    for (const item of [e.title, ...e.items])
      expect(item, `${e.version}: "${item.slice(0, 60)}…"`).not.toMatch(/R\$\s*\d/);
});

it("nenhuma entrada cita nome próprio de pessoa, conta ou empresa", () => {
  for (const e of CHANGELOG)
    for (const item of [e.title, ...e.items])
      for (const termo of TERMOS_PESSOAIS)
        expect(item.toLowerCase(), `${e.version} cita "${termo}"`).not.toContain(termo);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/changelog.test.ts`
Expected: FAIL nas duas guardas, listando as versões ofensoras.

- [ ] **Step 3: Reescrever as entradas de `lib/changelog.ts`**

Para cada item apontado: preservar *o que a mudança fez*, remover *quanto e de quem*. `"R$ 42.080,93 na Cristian Cassoli"` → `"o saldo que já existia em cada caixinha"`. Nomes de cartão de banco (Nubank, Bradesco) **ficam** — são produto, não pessoa. Não apagar entradas nem mudar `version`/`date`/ordem: as outras asserções do arquivo travam isso.

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run tests/changelog.test.ts`
Expected: PASS (as 4 asserções antigas + as 2 novas).

- [ ] **Step 5: Commit**

```bash
git add lib/changelog.ts tests/changelog.test.ts
git commit -m "fix: tira dado pessoal do changelog publicado em /novidades"
```

---

### Task 2: Identidade por instância

**Files:**
- Create: `lib/branding.ts`
- Test: `tests/branding.test.ts`
- Modify: `app/layout.tsx`, `app/manifest.ts`, `app/(app)/LockScreen.tsx:69`, `app/(app)/novidades/page.tsx:20`, `app/(auth)/login/page.tsx:53,137`, `scripts/telegram-webhook.ts:7`, `.env.example`

**Interfaces:**
- Consumes: nada.
- Produces: `appName(): string` e `displayDomain(): string | null` de `lib/branding.ts`.

- [ ] **Step 1: Escrever o teste (falhando)**

`tests/branding.test.ts`. As funções leem `process.env`, então o teste seta e restaura `process.env.APP_NAME` / `APP_URL` em cada caso.

```ts
it("appName cai no padrão sem APP_NAME", () => expect(appName()).toBe("Grana"));
it("appName usa o valor do ambiente", () => /* APP_NAME="Finanças da Ana" */ expect(appName()).toBe("Finanças da Ana"));
it("displayDomain tira o esquema", () => /* APP_URL="https://x.com" */ expect(displayDomain()).toBe("x.com"));
it("displayDomain tira a barra final", () => /* APP_URL="https://x.com/" */ expect(displayDomain()).toBe("x.com"));
it("displayDomain aceita URL sem esquema", () => /* APP_URL="x.com" */ expect(displayDomain()).toBe("x.com"));
it("displayDomain é null sem APP_URL", () => expect(displayDomain()).toBeNull());
it("displayDomain é null com APP_URL em branco", () => /* APP_URL="  " */ expect(displayDomain()).toBeNull());
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/branding.test.ts`
Expected: FAIL — `lib/branding.ts` não existe.

- [ ] **Step 3: Implementar `appName(): string` e `displayDomain(): string | null` em `lib/branding.ts`**

`appName` devolve `process.env.APP_NAME?.trim() || "Grana"`. `displayDomain` devolve null quando `APP_URL` falta ou é só espaço; caso contrário tira esquema e barras das pontas. Ler em função, não em constante de módulo: constante congelaria o valor no build.

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run tests/branding.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Trocar os seis lugares com nome ou domínio fixo**

`app/layout.tsx` (title, applicationName, appleWebApp.title), `app/manifest.ts` (name, short_name), `LockScreen.tsx:69` ("Grana está trancado"), `novidades/page.tsx:20` ("O que mudou no Grana"), `login/page.tsx:53,137` (as duas ocorrências do domínio — some o parágrafo inteiro quando `displayDomain()` é null), `scripts/telegram-webhook.ts:7` (tirar o fallback literal; sem `APP_URL` o script aborta com mensagem dizendo qual variável falta).

- [ ] **Step 6: Verificar que nenhum literal sobrou**

Run: `grep -rni "grana" app lib scripts --include="*.ts" --include="*.tsx" | grep -v "branding.ts\|changelog.ts"`
Expected: nenhuma linha.

- [ ] **Step 7: Completar o `.env.example`**

Acrescentar `APP_NAME`, `APP_URL`, `DATABASE_SCHEMA`, `INSTANCE_SCHEMAS`, `BRAPI_TOKEN` e `CRON_SECRET`, marcando em comentário quais são obrigatórias (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_PASSWORD`) e quais são opcionais.

- [ ] **Step 8: Rodar a suíte e o build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 9: Commit**

```bash
git add lib/branding.ts tests/branding.test.ts app lib scripts/telegram-webhook.ts .env.example
git commit -m "feat: nome e endereço do app vêm do ambiente"
```

---

### Task 3: Categorização genérica

**Files:**
- Modify: `lib/import-normalize.ts:32` e demais regras com nome próprio
- Test: `tests/import-normalize.test.ts`

**Interfaces:**
- Consumes: nada. Produces: nada (mesma API).

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
it("as regras de categoria não dependem de nome de pessoa", () => {
  for (const termo of ["hana", "audrey", "heitor"])
    expect(KEYWORD_MAP.some((r) => r.pattern.source.toLowerCase().includes(termo))).toBe(false);
});
it("continua categorizando pelo termo universal", () => {
  expect(keywordCategory("DROGARIA SAO PAULO")).toBe("Saúde");
});
```

`KEYWORD_MAP` existe em `lib/import-normalize.ts:28` mas **não é exportado** — exportar. `keywordCategory` (`:37`) já é exportado e já é usado pelos testes atuais do arquivo; o import no topo do teste precisa ganhar `KEYWORD_MAP`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/import-normalize.test.ts`
Expected: FAIL na primeira asserção.

- [ ] **Step 3: Tirar os nomes próprios das regex**

Manter os termos universais (`farm[aá]cia`, `rem[eé]dio`, `dentista`, `sa[uú]de`, `tire[oó]ide`…).

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run tests/import-normalize.test.ts`
Expected: PASS, incluindo os testes que já existiam.

- [ ] **Step 5: Commit**

```bash
git add lib/import-normalize.ts tests/import-normalize.test.ts
git commit -m "fix: categorização por termo universal, sem nome próprio"
```

---

### Task 4: Regras de instância (puro)

Toda a decisão dos dois scripts, isolada do banco para poder ser testada.

**Files:**
- Create: `lib/instance-schema.ts`
- Test: `tests/instance-schema.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces, de `lib/instance-schema.ts`:
  - `assertSchemaName(name: string): string` — devolve o nome ou lança `Error` com motivo.
  - `pendingMigrations(all: string[], applied: string[]): string[]` — as que faltam, na ordem de `all`.
  - `parseInstanceSchemas(raw: string | undefined): string[]` — lista do `INSTANCE_SCHEMAS`.
  - `envBlock(opts: { schema: string; appName: string; appUrl: string; password: string; authSecret: string }): string` — texto para colar na Vercel.

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
describe("assertSchemaName", () => {
  it("aceita nome simples", () => expect(assertSchemaName("fulano")).toBe("fulano"));
  it("aceita dígitos e underscore", () => expect(assertSchemaName("ana_2")).toBe("ana_2"));
  it("recusa public — é o schema do dono", () =>
    expect(() => assertSchemaName("public")).toThrow(/public/i));
  it("recusa aspas e ponto-e-vírgula — o CREATE SCHEMA é interpolado", () => {
    expect(() => assertSchemaName('x"; drop schema public cascade; --')).toThrow();
    expect(() => assertSchemaName("x'y")).toThrow();
  });
  it("recusa espaço, maiúscula e vazio", () => {
    for (const n of ["com espaco", "Fulano", "", "  "]) expect(() => assertSchemaName(n)).toThrow();
  });
  it("recusa nome começando com dígito", () => expect(() => assertSchemaName("2ana")).toThrow());
});

describe("pendingMigrations", () => {
  it("devolve as que faltam, na ordem", () =>
    expect(pendingMigrations(["a", "b", "c"], ["a"])).toEqual(["b", "c"]));
  it("schema em dia não tem pendência", () =>
    expect(pendingMigrations(["a", "b"], ["a", "b"])).toEqual([]));
  it("schema novo recebe todas", () =>
    expect(pendingMigrations(["a", "b"], [])).toEqual(["a", "b"]));
  it("ignora registro desconhecido no banco", () =>
    expect(pendingMigrations(["a"], ["a", "antiga"])).toEqual([]));
});

describe("parseInstanceSchemas", () => {
  it("separa por vírgula e apara espaço", () =>
    expect(parseInstanceSchemas(" ana , bruno ")).toEqual(["ana", "bruno"]));
  it("ignora vazio e duplicata", () =>
    expect(parseInstanceSchemas("ana,,ana, ")).toEqual(["ana"]));
  it("variável ausente é lista vazia", () => expect(parseInstanceSchemas(undefined)).toEqual([]));
});

describe("envBlock", () => {
  it("traz o schema na connection string e nas variáveis", () => {
    const txt = envBlock({ schema: "ana", appName: "Grana da Ana", appUrl: "https://ana.app", password: "p", authSecret: "s" });
    expect(txt).toContain("DATABASE_SCHEMA=ana");
    expect(txt).toContain("APP_NAME=Grana da Ana");
    expect(txt).toContain("APP_PASSWORD=p");
    expect(txt).toContain("AUTH_SECRET=s");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/instance-schema.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar as quatro funções em `lib/instance-schema.ts`**

`assertSchemaName` valida contra `/^[a-z_][a-z0-9_]*$/` e recusa `public` à parte, com mensagem própria — a lista de permitidos é o que torna seguro interpolar o nome no `CREATE SCHEMA`, e o comentário do arquivo deve dizer isso.

- [ ] **Step 4: Rodar até passar**

Run: `npx vitest run tests/instance-schema.test.ts`
Expected: PASS (14 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/instance-schema.ts tests/instance-schema.test.ts
git commit -m "feat: regras de nome de schema e de migrations pendentes"
```

---

### Task 5: Provisionador

**Files:**
- Create: `scripts/provisiona-instancia.ts`
- Modify: `package.json` (script `instancia:nova`)

**Interfaces:**
- Consumes: `assertSchemaName`, `pendingMigrations`, `envBlock` da Task 4; o mecanismo de aplicar SQL e registrar em `_prisma_migrations` de `scripts/aplica-migration.ts`.
- Produces: nada que outras tasks importem.

Sem teste automatizado: o script é orquestração de banco, e o repositório não tem teste com banco. O que decide está na Task 4; a verificação aqui é o `--dry-run` e o smoke da Task 7.

- [ ] **Step 1: Escrever o script**

`npx tsx scripts/provisiona-instancia.ts <schema> [--dry-run]`. Em ordem: `assertSchemaName`; `CREATE SCHEMA IF NOT EXISTS`; ler os nomes das migrations de `prisma/migrations`; ler as já registradas em `<schema>._prisma_migrations` (vazio se a tabela não existe); `pendingMigrations`; aplicar cada uma e registrar; imprimir `envBlock` com `APP_PASSWORD` e `AUTH_SECRET` de `crypto.randomBytes(32).toString("base64url")`.

Com `--dry-run`, imprime o que faria e não executa nenhum comando.

O cabeçalho do arquivo repete os limites herdados do `aplica-migration.ts` (sem transação, sem checksum, divisão por `;` no fim da linha) e diz, explicitamente, que este script **nunca** derruba schema — quem faz isso é o `e2e-reset-db.ts`, e os dois não compartilham código de propósito.

- [ ] **Step 2: Conferir o dry-run num schema inexistente**

Run: `npx tsx scripts/provisiona-instancia.ts teste_dry --dry-run`
Expected: lista as 28 migrations como pendentes e diz que nada foi executado. Conferir que o schema NÃO foi criado.

- [ ] **Step 3: Conferir a recusa**

Run: `npx tsx scripts/provisiona-instancia.ts public`
Expected: erro mencionando `public`, sem tocar no banco.

- [ ] **Step 4: Provisionar de verdade um schema descartável e reexecutar**

Run: `npx tsx scripts/provisiona-instancia.ts teste_tmp` e logo depois o mesmo comando outra vez.
Expected: na primeira, 28 aplicadas; na segunda, 0 pendentes. Derrubar o schema ao fim (`DROP SCHEMA teste_tmp CASCADE`) e registrar no relatório que foi derrubado.

- [ ] **Step 5: Commit**

```bash
git add scripts/provisiona-instancia.ts package.json
git commit -m "feat: provisionador de instância por schema"
```

---

### Task 6: Atualizar as cópias

**Files:**
- Create: `scripts/atualiza-instancias.ts`
- Modify: `package.json` (script `instancia:atualiza`)

**Interfaces:**
- Consumes: `parseInstanceSchemas`, `pendingMigrations` da Task 4; o aplicador da Task 5 (extrair para função exportada de `scripts/provisiona-instancia.ts` em vez de duplicar).

- [ ] **Step 1: Extrair o aplicador**

Em `scripts/provisiona-instancia.ts`, exportar `applyPending(schema: string, nomes: string[], dryRun: boolean): Promise<number>`, usada pelos dois scripts. Rodar `npx tsx scripts/provisiona-instancia.ts teste_dry --dry-run` de novo para confirmar que a extração não mudou o comportamento.

- [ ] **Step 2: Escrever o script**

`npx tsx scripts/atualiza-instancias.ts [--dry-run] [--schema <nome>]`. Sem `--schema`, lê `INSTANCE_SCHEMAS`; com ele, age só naquele. Para cada schema imprime uma linha com quantas aplicou ou "em dia", e ao fim um total. Falha num schema não interrompe os outros — o relatório final diz qual falhou e por quê.

- [ ] **Step 3: Conferir sem instâncias configuradas**

Run: `npx tsx scripts/atualiza-instancias.ts --dry-run` com `INSTANCE_SCHEMAS` vazio.
Expected: diz que não há instância configurada e sai com código 0, sem erro.

- [ ] **Step 4: Commit**

```bash
git add scripts/atualiza-instancias.ts scripts/provisiona-instancia.ts package.json
git commit -m "feat: aplica migrations pendentes em todas as instâncias"
```

---

### Task 7: Smoke do banco vazio

A regressão que mataria uma cópia nova e que nenhum teste atual pega — o banco do dono está cheio.

**Files:**
- Create: `scripts/smoke-vazio.ts`
- Modify: `package.json` (script `smoke:vazio`)

**Interfaces:**
- Consumes: nada.

- [ ] **Step 1: Escrever o script**

Em ordem: sobe `postgres:16` em Docker numa porta alta com nome fixo (removendo um container anterior de mesmo nome); espera o `pg_isready`; roda `prisma migrate deploy` com `DATABASE_URL`/`DIRECT_URL` apontando para ele; levanta `next dev` numa porta alta com esse banco e **sem** as variáveis de integração (`TELEGRAM_BOT_TOKEN`, `BRAPI_TOKEN`, `OPENROUTER_API_KEY` vazias, para provar a degradação que o spec afirma); pede as 11 rotas; derruba app e container **sempre**, inclusive em falha.

Rotas: `dashboard`, `mes`, `panorama`, `cartoes`, `reservas`, `investimentos`, `itens`, `categorias`, `calculadora`, `ajustes`, `novidades`.

O app exige sessão, e o smoke não deve editar `proxy.ts` nem o layout — roda com `APP_PASSWORD` e `AUTH_SECRET` próprios e faz login de verdade, reusando o cookie nas 11 chamadas. O Auth.js v5 exige o par CSRF: `GET /api/auth/csrf` devolve o token e grava o cookie, e o `POST` para `/api/auth/callback/credentials` precisa mandar **os dois** — o cookie e o `csrfToken` no corpo — ou responde 302 para `/login` sem sessão. Se a sessão não for obtida, o smoke falha dizendo isso, em vez de reportar 11 rotas como quebradas.

Sai com código ≠ 0 se alguma rota não devolver 200.

- [ ] **Step 2: Rodar**

Run: `npm run smoke:vazio`
Expected: as 11 rotas em 200 e "smoke OK"; `docker ps -a | grep grana` depois não mostra container.

- [ ] **Step 3: Provar que o smoke detecta regressão**

Quebrar de propósito uma página (ex.: `throw new Error("x")` no topo de `app/(app)/reservas/page.tsx`), rodar `npm run smoke:vazio`, confirmar que falha apontando `/reservas`, e desfazer com `git checkout`.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-vazio.ts package.json
git commit -m "test: smoke do app contra banco vazio"
```

---

### Task 8: Runbook e entrega

**Files:**
- Create: `docs/instancias.md`
- Modify: `package.json` (bump minor), `lib/changelog.ts` (entrada nova)

- [ ] **Step 1: Escrever `docs/instancias.md`**

Quatro seções em passos numerados:

1. **Criar** — `instancia:nova <schema>`; criar o projeto na Vercel apontando para o mesmo repositório e a mesma branch; colar o bloco de variáveis; apontar o domínio.
2. **Entregar** — como passar a senha; que o Telegram exige **um bot por cópia** (webhook é 1:1, o bot do dono não serve); que BRAPI e OpenRouter são chaves do dono, opcionais, e o app funciona inteiro sem elas.
3. **Atualizar** — `push` na `main` redeploya todas; `instancia:atualiza` aplica as migrations pendentes; sempre `--dry-run` antes.
4. **Remover** — exportar o schema antes (`pg_dump -n <schema>`), depois derrubar o projeto na Vercel e só então o schema.

Abrir com a consequência registrada no spec: o isolamento é lógico, e a connection string alcança todas as cópias.

- [ ] **Step 2: Bump e changelog**

`package.json` para a próxima minor. Entrada em `lib/changelog.ts` em linguagem de usuário, **sujeita às guardas da Task 1** — sem valor em reais e sem nome próprio.

- [ ] **Step 3: Verificar tudo**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run smoke:vazio`
Expected: tudo verde, incluindo as guardas do changelog sobre a entrada recém-escrita.

- [ ] **Step 4: Commit**

```bash
git add docs/instancias.md package.json lib/changelog.ts
git commit -m "docs: runbook das cópias do app"
```
