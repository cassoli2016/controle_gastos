# Lote de higiene v1.1.1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar os itens de higiene deferidos pelo review final da v1.1.0 (PR #26): normalizador de texto canônico, rótulo "Novidades" no rodapé desktop, `/novidades` no matcher do middleware, política de entrega no AGENTS.md, verificação visual mobile de /investimentos — como release v1.1.1.

**Architecture:** `lib/text.ts` passa a ser a única fonte de `stripDiacritics` (só acentos, preserva caixa) e `normalizeText` (minúsculas + acentos); os 7 módulos que duplicavam essa lógica migram SEM mudança de comportamento. O resto são edições pontuais de UI/config/docs e o bump patch com entrada no changelog.

**Tech Stack:** Next.js App Router, Vitest.

## Global Constraints

- **Comportamento preservado nos 7 call sites**: `nubank-share` e `telegram-parse` NÃO fazem lowercase — migram para `stripDiacritics`, nunca para `normalizeText`. Os demais fazem lowercase — migram para `normalizeText` (+ os sufixos locais que já tinham: `.trim()`, colapso de espaços).
- Textos em pt-BR com acentuação correta; changelog em linguagem de usuário.
- Versão desta entrega: `1.1.1` (patch) — bump + entrada do changelog no mesmo commit.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: `lib/text.ts` canônico + migração dos 7 usos

**Files:**
- Create: `lib/text.ts`
- Test: `tests/text.test.ts`
- Modify: `lib/month-filter.ts`, `tests/month-filter.test.ts`, `lib/card-match.ts`, `lib/description-match.ts`, `lib/b3-report.ts`, `lib/csv-import.ts`, `lib/nubank-share.ts`, `lib/telegram-parse.ts`

**Interfaces:**
- Produces: `stripDiacritics(s: string): string`; `normalizeText(s: string): string` em `@/lib/text`.

- [ ] **Step 1: Write the failing test**

Crie `tests/text.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripDiacritics, normalizeText } from "@/lib/text";

describe("stripDiacritics", () => {
  it("remove acentos preservando a caixa", () => {
    expect(stripDiacritics("Água")).toBe("Agua");
    expect(stripDiacritics("SÃO JOÃO")).toBe("SAO JOAO");
    expect(stripDiacritics("dezembro")).toBe("dezembro");
  });
});

describe("normalizeText", () => {
  it("minúsculas e sem acentos", () => {
    expect(normalizeText("Crédito")).toBe("credito");
    expect(normalizeText("ALUGUEL")).toBe("aluguel");
    expect(normalizeText("São João")).toBe("sao joao");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/text.test.ts`
Expected: FAIL — `Cannot find module '@/lib/text'`.

- [ ] **Step 3: Criar `lib/text.ts` e migrar os 7 módulos**

Crie `lib/text.ts`:

```ts
/** Normalização de texto compartilhada (busca e matching). */

/** Remove acentos preservando a caixa ("Água" → "Agua"). */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Minúsculas e sem acentos ("Crédito" → "credito"). */
export function normalizeText(s: string): string {
  return stripDiacritics(s.toLowerCase());
}
```

Migre cada módulo (comportamento idêntico, confirmável pelos testes existentes de cada um):

1. `lib/month-filter.ts`: remova a função `normalizeText` local; adicione `import { normalizeText } from "@/lib/text";` (o `filterViews` continua igual). Em `tests/month-filter.test.ts`, remova o `describe("normalizeText")` inteiro e tire `normalizeText` do import — esses casos agora vivem em `tests/text.test.ts`.
2. `lib/card-match.ts`: remova a função privada `normalize`; adicione o import de `normalizeText` e troque as chamadas `normalize(` por `normalizeText(`.
3. `lib/description-match.ts`: o corpo de `normalizeDescription` vira `return normalizeText(s).replace(/\s+/g, " ").trim();` (mantendo o export e o JSDoc).
4. `lib/b3-report.ts`: o corpo de `normalizeHeader` vira `return normalizeText(String(s ?? "")).trim();`
5. `lib/csv-import.ts`: o corpo de `normalizeHeader` vira `return normalizeText(cell).trim();`
6. `lib/nubank-share.ts`: remova `stripAccents` local; importe `stripDiacritics` e troque as chamadas `stripAccents(` por `stripDiacritics(`. (Preserva caixa — NÃO usar normalizeText.)
7. `lib/telegram-parse.ts`: idem ao item 6.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: suíte inteira verde (os testes existentes de card-match, description-match, b3-report, csv-import, nubank-share e telegram-parse provam que o comportamento não mudou), tsc limpo, lint 0 erros (4 warnings pré-existentes), build ok.

- [ ] **Step 5: Commit**

```bash
git add lib/text.ts tests/text.test.ts lib/month-filter.ts tests/month-filter.test.ts lib/card-match.ts lib/description-match.ts lib/b3-report.ts lib/csv-import.ts lib/nubank-share.ts lib/telegram-parse.ts
git commit -m "refactor: normalizador de texto canônico em lib/text.ts"
```

---

### Task 2: Rótulo no rodapé, matcher do middleware e política no AGENTS.md

**Files:**
- Modify: `components/app-shell/Sidebar.tsx` (linha da versão)
- Modify: `middleware.ts` (matcher)
- Modify: `AGENTS.md` (nova seção ao final)

- [ ] **Step 1: Rótulo "Novidades" no rodapé desktop**

Em `components/app-shell/Sidebar.tsx`, a segunda linha do link do rodapé hoje é:

```tsx
<div className="tabular-nums">
  v{version}
  {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    ? ` · ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
    : ""}
</div>
```

Troque por (mesmo padrão do rodapé mobile, que já diz "— Novidades"):

```tsx
<div className="tabular-nums">
  v{version}
  {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    ? ` · ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
    : ""}
  {" — Novidades"}
</div>
```

- [ ] **Step 2: `/novidades` no matcher do middleware**

Em `middleware.ts`, adicione `"/novidades/:path*"` ao array `matcher` (após `"/panorama/:path*"`).

- [ ] **Step 3: Política de entrega no AGENTS.md**

Ao FINAL de `AGENTS.md` (fora do bloco `<!-- BEGIN/END:nextjs-agent-rules -->`), adicione:

```md

# Política de entrega

Todo PR que altera o app bumpa `version` no `package.json` (minor para feature, patch para fix/higiene) e adiciona a entrada correspondente em `lib/changelog.ts` (página /novidades, em linguagem de usuário) no mesmo commit. O teste `tests/changelog.test.ts` trava o sincronismo bump ↔ changelog.
```

- [ ] **Step 4: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell/Sidebar.tsx middleware.ts AGENTS.md
git commit -m "chore: rótulo Novidades no rodapé, matcher do middleware e política de entrega"
```

---

### Task 3: Bump v1.1.1 + changelog + verificação final

**Files:**
- Modify: `package.json`, `package-lock.json`, `lib/changelog.ts`

- [ ] **Step 1: Bump e entrada do changelog**

Em `package.json`: `"version": "1.1.0"` → `"version": "1.1.1"`; rode `npm install --package-lock-only`.

Em `lib/changelog.ts`, adicione NO TOPO do array `CHANGELOG`:

```ts
  {
    version: "1.1.1",
    date: "2026-08-04",
    title: "Ajustes de manutenção",
    items: [
      "O rodapé do computador agora indica o atalho para as Novidades, como no celular.",
      "Arrumação interna: normalização de texto unificada e proteção de rota reforçada.",
    ],
  },
```

- [ ] **Step 2: Verificar suítes**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde — `tests/changelog.test.ts` confirma o sincronismo 1.1.1.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json lib/changelog.ts
git commit -m "chore: versão 1.1.1 e changelog"
```

- [ ] **Step 4: e2e**

Run: `npm run e2e`
Expected: 7/7. Se falhar no reset do banco com mensagem vazia, rode `npx tsx scripts/e2e-reset-db.ts` isolado e repita.

- [ ] **Step 5: Verificação visual (dados reais, somente leitura)**

Suba `APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3189` e, com Playwright (script temporário dentro do projeto, deletar depois; login em /login, `input[name="password"]`, senha "visual-teste"):

1. Desktop 1280×800: rodapé da sidebar mostra `v1.1.1 — Novidades` e clicar navega para `/novidades` (com a entrada "Ajustes de manutenção" no topo). Screenshots.
2. **Mobile 390×844 em `/investimentos`** (item pendente da v1.1.0): a tabela da carteira com 10 colunas rola horizontalmente dentro do card (`overflow-x-auto`) sem estourar a largura da página. Screenshot da tela e screenshot após rolar a tabela até as colunas Investido/Valor atual.
3. `/mes` continua ok (smoke: busca e cards de reserva recolhidos). Screenshot.

Encerrar o servidor, deletar o script, `git status` limpo.
