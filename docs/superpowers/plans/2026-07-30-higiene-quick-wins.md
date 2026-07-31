# Higiene & Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar categorias de receita, paleta de cores distinta, busca+filtro em Itens, e robustez técnica (guards de month/NaN, server actions blindadas, agregação por id).

**Architecture:** Helpers puros novos (`sanitizeMonth`, `filterItems`, `guardAction`) com TDD; mudanças de dados via script one-off idempotente (padrão do repo); páginas server-side com estado na URL (padrão `?month=`). Sem migration de schema.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma 7 + Postgres (Supabase), vitest, Playwright manual p/ verificação visual.

**Spec:** `docs/superpowers/specs/2026-07-30-higiene-quick-wins-design.md`

## Global Constraints

- Dinheiro em centavos inteiros; Prisma Decimal → `decimalToCents(String(x))`.
- Textos de UI em pt-BR com acentuação correta.
- Testes vitest em `tests/*.test.ts`; alias `@/` = raiz. Rodar `npm test`.
- Commits convencionais em pt-BR com rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01XTLnucv4no21kxt76XPnnu`.
- Branch: `feat/higiene-quick-wins` (já criada, contém o spec).
- **Decisão registrada:** rename `middleware.ts`→`proxy.ts` ADIADO — não há doc de proxy em `node_modules/next/dist/docs/` para validar o rename (AGENTS.md exige consultar a doc antes de mudanças de convenção do Next).

---

### Task 1: Guards puros — `sanitizeMonth` e `decimalToCents` NaN

**Files:**
- Modify: `lib/dates.ts`, `lib/money.ts`
- Test: `tests/dates.test.ts`, `tests/money.test.ts`

**Interfaces:**
- Produces: `sanitizeMonth(month: string | undefined): string | null` (lib/dates); `decimalToCents` passa a lançar `Error` para entrada não numérica.

- [ ] **Step 1: Testes que falham**

Em `tests/dates.test.ts`, adicionar `sanitizeMonth` ao import de `@/lib/dates` e ao final:

```ts
describe("sanitizeMonth", () => {
  it("aceita YYYY-MM válido", () => expect(sanitizeMonth("2026-08")).toBe("2026-08"));
  it("rejeita mês 13/00", () => {
    expect(sanitizeMonth("2026-13")).toBeNull();
    expect(sanitizeMonth("2026-00")).toBeNull();
  });
  it("rejeita lixo e formatos parciais", () => {
    expect(sanitizeMonth("abc")).toBeNull();
    expect(sanitizeMonth("2026-8")).toBeNull();
    expect(sanitizeMonth("2026-08-01")).toBeNull();
  });
  it("undefined → null", () => expect(sanitizeMonth(undefined)).toBeNull());
});
```

Em `tests/money.test.ts`, ao final (import de `decimalToCents` já deve existir; senão, adicionar):

```ts
describe("decimalToCents guard", () => {
  it("lança para entrada não numérica", () => {
    expect(() => decimalToCents("abc")).toThrow(/abc/);
    expect(() => decimalToCents(Number.NaN)).toThrow();
  });
  it("continua convertendo números válidos", () => {
    expect(decimalToCents("1383.42")).toBe(138342);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/dates.test.ts tests/money.test.ts`
Expected: FAIL (`sanitizeMonth` não exportado; NaN não lança).

- [ ] **Step 3: Implementar**

`lib/dates.ts` (ao final):

```ts
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Valida "YYYY-MM" vindo da URL; inválido/ausente → null (caller usa o mês default). */
export function sanitizeMonth(month: string | undefined): string | null {
  return month !== undefined && MONTH_RE.test(month) ? month : null;
}
```

`lib/money.ts` — corpo de `decimalToCents` vira:

```ts
export function decimalToCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) throw new Error(`Valor decimal inválido: ${value}`);
  return Math.round(n * 100);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/dates.test.ts tests/money.test.ts` → PASS. Depois `npm test` inteiro (garante que nenhum fluxo dependia de NaN silencioso).

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/money.ts tests/dates.test.ts tests/money.test.ts
git commit -m "feat: guards de mês malformado e decimal inválido"
```

---

### Task 2: `filterItems` + `parseItemStatus`

**Files:**
- Create: `lib/items-filter.ts`
- Test: `tests/items-filter.test.ts`

**Interfaces:**
- Consumes: `normalizeDescription` de `@/lib/description-match`.
- Produces: `type ItemStatusFilter = "ativos" | "arquivados" | "todos"`; `parseItemStatus(s: string | undefined): ItemStatusFilter`; `filterItems<T extends { name: string; active: boolean }>(items: T[], q: string | undefined, status: ItemStatusFilter): T[]`.

- [ ] **Step 1: Teste que falha** (`tests/items-filter.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { filterItems, parseItemStatus } from "@/lib/items-filter";

const ITEMS = [
  { name: "Internet", active: true },
  { name: "Internet", active: false },
  { name: "Plano de Saúde", active: true },
  { name: "Água", active: true },
];

describe("parseItemStatus", () => {
  it("default ativos", () => expect(parseItemStatus(undefined)).toBe("ativos"));
  it("aceita arquivados/todos", () => {
    expect(parseItemStatus("arquivados")).toBe("arquivados");
    expect(parseItemStatus("todos")).toBe("todos");
  });
  it("lixo → ativos", () => expect(parseItemStatus("x")).toBe("ativos"));
});

describe("filterItems", () => {
  it("status ativos esconde arquivados", () =>
    expect(filterItems(ITEMS, undefined, "ativos")).toHaveLength(3));
  it("status arquivados só arquivados", () =>
    expect(filterItems(ITEMS, undefined, "arquivados")).toEqual([{ name: "Internet", active: false }]));
  it("busca sem caixa/acentos", () =>
    expect(filterItems(ITEMS, "agua", "todos")).toEqual([{ name: "Água", active: true }]));
  it("busca + status combinam", () =>
    expect(filterItems(ITEMS, "internet", "ativos")).toEqual([{ name: "Internet", active: true }]));
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/items-filter.test.ts` → módulo não existe.

- [ ] **Step 3: Implementar** (`lib/items-filter.ts`)

```ts
import { normalizeDescription } from "@/lib/description-match";

export type ItemStatusFilter = "ativos" | "arquivados" | "todos";

/** `?status=` da URL; qualquer outra coisa cai no default "ativos". */
export function parseItemStatus(s: string | undefined): ItemStatusFilter {
  return s === "arquivados" || s === "todos" ? s : "ativos";
}

/** Filtro da lista de Itens: status + busca por nome sem caixa/acentos. */
export function filterItems<T extends { name: string; active: boolean }>(
  items: T[],
  q: string | undefined,
  status: ItemStatusFilter,
): T[] {
  const nq = q ? normalizeDescription(q) : "";
  return items.filter((i) => {
    if (status === "ativos" && !i.active) return false;
    if (status === "arquivados" && i.active) return false;
    return nq === "" || normalizeDescription(i.name).includes(nq);
  });
}
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- tests/items-filter.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/items-filter.ts tests/items-filter.test.ts
git commit -m "feat: filtro puro de itens por status e busca"
```

---

### Task 3: `EntryView.categoryId` + `expenseByCategory` por id

**Files:**
- Modify: `lib/calc.ts`, `lib/entries.ts`
- Test: `tests/calc.test.ts`

**Interfaces:**
- Produces: `EntryView` ganha `categoryId: string` (obrigatório); `expenseByCategory` retorna `{ categoryId: string; categoryName: string; cents: number }[]` agregando por id; `dailyBudgetEntryView` usa `categoryId: DAILY_BUDGET_ENTRY_ID`.

- [ ] **Step 1: Testes que falham** — em `tests/calc.test.ts`:

1. Na fixture `E`, adicionar `categoryId` a cada linha (ex.: `categoryId: "cat-renda"`, `"cat-assin"`, `"cat-transp"`, `"cat-assin"` — YOUTUBE e PS PLUS na MESMA categoria id).
2. Atualizar o teste de `expenseByCategory` existente para o novo shape e acrescentar o caso de homônimos:

```ts
it("expenseByCategory agrega por ID e rotula pelo nome", () => {
  expect(expenseByCategory(E)).toEqual([
    { categoryId: "cat-assin", categoryName: "Assinaturas", cents: 65000 },
    { categoryId: "cat-transp", categoryName: "Transporte", cents: 22000 },
  ]);
});
it("categorias homônimas com ids diferentes NÃO se misturam", () => {
  const homon: EntryView[] = [
    { itemName: "A", categoryId: "c1", categoryName: "Outros", categoryType: "EXPENSE", plannedCents: 100, paid: false, paidCents: null },
    { itemName: "B", categoryId: "c2", categoryName: "Outros", categoryType: "EXPENSE", plannedCents: 200, paid: false, paidCents: null },
  ];
  expect(expenseByCategory(homon)).toHaveLength(2);
});
```

3. No bloco da reserva, conferir o id sintético:

```ts
it("linha da reserva carrega o id sintético", () =>
  expect(reserva.categoryId).toBe("daily-budget"));
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/calc.test.ts` (erro de tipo/shape).

- [ ] **Step 3: Implementar**

`lib/calc.ts` — `EntryView` ganha `categoryId: string;` (antes de `categoryName`); `expenseByCategory` vira:

```ts
export function expenseByCategory(e: EntryView[]): { categoryId: string; categoryName: string; cents: number }[] {
  const map = new Map<string, { categoryName: string; cents: number }>();
  for (const x of expense(e)) {
    const cur = map.get(x.categoryId);
    map.set(x.categoryId, { categoryName: cur?.categoryName ?? x.categoryName, cents: (cur?.cents ?? 0) + x.plannedCents });
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.cents - a.cents);
}
```

`lib/entries.ts` — `toEntryView` inclui `categoryId: category?.id ?? "sem-categoria"` (o type `PrismaEntryRow` ganha `id: string` dentro de `category`/`item.category`); `dailyBudgetEntryView` inclui `categoryId: DAILY_BUDGET_ENTRY_ID` (importar de `@/lib/daily-budget`).

- [ ] **Step 4: Compilar o app inteiro e corrigir os pontos que o tsc apontar**

Run: `npx tsc --noEmit`
Esperado: erros onde `EntryView` é construído/consumido — corrigir cada um (ex.: `app/(app)/dashboard/page.tsx` `pieData` passa a usar `catColor` por id: `new Map(categories.map((c) => [c.id, c.color]))` e `catColor.get(x.categoryId)`; `lib/matrix.ts`/`app/(app)/panorama` se construírem EntryView). NÃO usar `as never` para silenciar.

- [ ] **Step 5: Rodar tudo e commitar**

Run: `npm test && npm run lint` → PASS/sem erros novos.

```bash
git add -A && git commit -m "feat: agregação de despesas por id de categoria"
```

---

### Task 4: `guardAction` nas server actions

**Files:**
- Create: `lib/action-guard.ts`
- Test: `tests/action-guard.test.ts`
- Modify: `app/(app)/mes/actions.ts` (16 exports), `app/(app)/cartoes/actions.ts` (8), `app/(app)/categorias/actions.ts` (3), `app/(app)/itens/actions.ts` (5), `app/(app)/reservas/actions.ts` (4), `app/(app)/investimentos/actions.ts` (8)

**Interfaces:**
- Produces: `guardAction<A extends unknown[], S extends { error?: string }>(fn: (...args: A) => Promise<S>): (...args: A) => Promise<S>`.

- [ ] **Step 1: Teste que falha** (`tests/action-guard.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { guardAction } from "@/lib/action-guard";

describe("guardAction", () => {
  it("sucesso passa direto", async () => {
    const fn = guardAction(async (n: number) => ({ ok: true, n }));
    expect(await fn(2)).toEqual({ ok: true, n: 2 });
  });
  it("erro inesperado vira { error } amigável", async () => {
    const fn = guardAction(async () => {
      throw new Error("db down");
      return { ok: true };
    });
    expect((await fn()).error).toMatch(/Não foi possível/);
  });
  it("controle do Next (digest NEXT_*) é relançado", async () => {
    const redirect = Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;push;/x" });
    const fn = guardAction(async () => {
      throw redirect;
      return {};
    });
    await expect(fn()).rejects.toBe(redirect);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/action-guard.test.ts`.

- [ ] **Step 3: Implementar** (`lib/action-guard.ts`)

```ts
/**
 * Blindagem das Server Actions: erro inesperado (banco fora, bug) vira
 * `{ error }` amigável no estado do formulário, em vez de estourar o error
 * boundary da página. Erros de CONTROLE do Next (redirect/notFound carregam
 * `digest` começando com "NEXT_") são relançados — engoli-los quebraria a
 * navegação.
 */
export function guardAction<A extends unknown[], S extends { error?: string }>(
  fn: (...args: A) => Promise<S>,
): (...args: A) => Promise<S> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      console.error("[server action]", err);
      return { error: "Não foi possível concluir. Tente novamente." } as S;
    }
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Aplicar a transformação mecânica nos 6 arquivos de actions**

Em cada arquivo, adicionar `import { guardAction } from "@/lib/action-guard";` e converter CADA `export async function`:

De:

```ts
export async function upsertEntry(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  // corpo
}
```

Para (corpo intacto, nome preservado na function expression para stack traces):

```ts
export const upsertEntry = guardAction(async function upsertEntry(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // corpo
});
```

Funções auxiliares NÃO exportadas ficam como estão. Conferir que nenhum arquivo exporta coisa que não seja async function/const de função (regra do "use server").

- [ ] **Step 6: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS; zero erros novos.

- [ ] **Step 7: Commit**

```bash
git add lib/action-guard.ts tests/action-guard.test.ts "app/(app)/mes/actions.ts" "app/(app)/cartoes/actions.ts" "app/(app)/categorias/actions.ts" "app/(app)/itens/actions.ts" "app/(app)/reservas/actions.ts" "app/(app)/investimentos/actions.ts"
git commit -m "feat: server actions blindadas com erro amigável"
```

---

### Task 5: Páginas — `sanitizeMonth` aplicado + busca/tabs em Itens

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/mes/page.tsx`, `app/(app)/cartoes/page.tsx`, `app/(app)/itens/page.tsx`

**Interfaces:**
- Consumes: `sanitizeMonth` (Task 1), `filterItems`/`parseItemStatus` (Task 2).

- [ ] **Step 1: `sanitizeMonth` nas 3 páginas com `?month=`**

Em dashboard/mes/cartoes, importar `sanitizeMonth` de `@/lib/dates` e trocar:

```ts
const month = qMonth ?? (await resolveDefaultMonth());
```

por:

```ts
const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
```

(Se `cartoes/page.tsx` tiver default diferente de `resolveDefaultMonth()`, manter o default dela e trocar só a validação de `qMonth`.)

- [ ] **Step 2: Busca + tabs em `app/(app)/itens/page.tsx`**

A página passa a receber `searchParams`:

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { filterItems, parseItemStatus, type ItemStatusFilter } from "@/lib/items-filter";
import { cn } from "@/lib/utils";

export default async function ItensPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status: qStatus } = await searchParams;
  const status = parseItemStatus(qStatus);
  // ...queries existentes...
  const visible = filterItems(items, q, status);
  const counts: Record<ItemStatusFilter, number> = {
    ativos: items.filter((i) => i.active).length,
    arquivados: items.filter((i) => !i.active).length,
    todos: items.length,
  };
```

Entre o header e o Card, o bloco de filtros (form GET preserva status; tabs preservam q):

```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
    {(["ativos", "arquivados", "todos"] as const).map((s) => (
      <Button key={s} asChild size="sm" variant={status === s ? "secondary" : "ghost"} className={cn(status === s && "font-semibold")}>
        <Link href={`/itens?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
          {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
        </Link>
      </Button>
    ))}
  </div>
  <form method="GET" action="/itens" className="flex items-center gap-2">
    <input type="hidden" name="status" value={status} />
    <Input name="q" defaultValue={q ?? ""} placeholder="Buscar item…" className="w-56" aria-label="Buscar item" />
    <Button type="submit" variant="outline" size="sm">
      <Search className="size-4" />
    </Button>
  </form>
</div>
```

O `items.map(...)` da tabela passa a mapear `visible`; lista vazia mostra linha "Nenhum item encontrado." (célula `colSpan={5}` com `text-muted-foreground`).

- [ ] **Step 3: Verificar** — `npm test && npx tsc --noEmit && npm run lint` → PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" "app/(app)/mes/page.tsx" "app/(app)/cartoes/page.tsx" "app/(app)/itens/page.tsx"
git commit -m "feat: guard de mês na URL e busca/filtro em itens"
```

---

### Task 6: Script de dados — unificar receitas + paleta

**Files:**
- Create: `scripts/fix-categorias.ts`

**Interfaces:**
- Consumes: prisma direto; nenhuma API nova.

- [ ] **Step 1: Escrever o script**

```ts
// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * Higiene de categorias (2026-07-30):
 * 1) Unifica as duas categorias INCOME: move itens/lançamentos de "Renda"
 *    (1 item arquivado, 0 lançamentos) para "Recebimentos" e apaga "Renda".
 * 2) Paleta com matiz distinto por categoria (3 pares colidiam; a pizza do
 *    Dashboard ficava ilegível). Cores já boas são mantidas.
 * Idempotente: sem "Renda", o passo 1 não faz nada; o passo 2 é um upsert de cor.
 *
 * Uso: npx tsx scripts/fix-categorias.ts
 */
const PALETTE: Record<string, string> = {
  "Saúde": "#ef4444",
  "Transporte": "#f59e0b",
  "Educação": "#eab308",
  "Alimentação": "#84cc16",
  "Recebimentos": "#10b981",
  "Seguros": "#14b8a6",
  "Moradia": "#3b82f6",
  "Cartão/Compras": "#6366f1",
  "Assinaturas": "#a855f7",
  "Lazer": "#d946ef",
  "Audrey": "#ec4899",
  "Outros": "#64748b",
};

async function main() {
  const renda = await prisma.category.findFirst({ where: { name: "Renda", type: "INCOME" } });
  if (renda) {
    const receb = await prisma.category.findFirst({ where: { name: "Recebimentos", type: "INCOME" } });
    if (!receb) throw new Error('Categoria "Recebimentos" não encontrada — abortando a fusão.');
    const [items, entries] = await Promise.all([
      prisma.item.updateMany({ where: { categoryId: renda.id }, data: { categoryId: receb.id } }),
      prisma.monthlyEntry.updateMany({ where: { categoryId: renda.id }, data: { categoryId: receb.id } }),
    ]);
    await prisma.category.delete({ where: { id: renda.id } });
    console.log(`"Renda" fundida em "Recebimentos": ${items.count} item(ns), ${entries.count} lançamento(s).`);
  } else {
    console.log('Sem categoria "Renda" — fusão já feita.');
  }

  for (const [name, color] of Object.entries(PALETTE)) {
    const res = await prisma.category.updateMany({ where: { name }, data: { color } });
    if (res.count === 0) console.log(`(paleta) categoria "${name}" não existe — ignorada.`);
  }
  console.log("Paleta aplicada.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar contra produção**

Run: `npx tsx scripts/fix-categorias.ts`
Expected: fusão 1 item / 0 lançamentos; paleta aplicada sem "não existe" inesperado.

- [ ] **Step 3: Conferir**

Query rápida (reusar o diagnóstico de categorias): apenas 1 categoria INCOME, cores todas distintas exceto o cinza de "Outros".

- [ ] **Step 4: Commit**

```bash
git add scripts/fix-categorias.ts
git commit -m "feat: unifica categorias de receita e aplica paleta distinta"
```

---

### Task 7: Verificação visual + suíte completa

**Files:**
- Patch temporário (NUNCA commitar): `middleware.ts`, `app/(app)/layout.tsx`
- Create temporário (deletar depois): `scripts/_shoot.mjs`

- [ ] **Step 1: Bypass de auth** — `middleware.ts` pass-through (`return NextResponse.next()`) e comentar o `redirect("/login")` do `app/(app)/layout.tsx`.

- [ ] **Step 2: Build + server** — `npm run build && npx next start -p 3123` (background).

- [ ] **Step 3: Screenshots** — `scripts/_shoot.mjs` (Playwright via `@playwright/test`, DENTRO do projeto — fora dele o import não resolve) de `/itens`, `/itens?status=todos&q=internet`, `/dashboard?month=2026-08`, `/categorias` em desktop(1440)+mobile(390), fullPage; dashboard também em dark (`colorScheme` do context).

- [ ] **Step 4: Conferir os PNGs**

Checklist: tabs Ativos/Arquivados/Todos com contagens; busca "internet" retorna as 2 (status todos); pizza do Dashboard com cores distintas (Educação amarela ≠ Audrey rosa; Cartão/Compras índigo ≠ Outros cinza); uma só categoria de receita em /categorias; nada estourando no mobile.

- [ ] **Step 5: Reverter e limpar** — `git checkout -- middleware.ts "app/(app)/layout.tsx"`, `rm -rf scripts/_shoot.mjs screens`, `git status` limpo (além dos commits).

- [ ] **Step 6: Suíte final** — `npm test && npm run lint && npm run build` → verde.

- [ ] **Step 7: Push + PR**

```bash
git push -u origin feat/higiene-quick-wins
gh pr create --base main --title "feat: higiene e quick wins (fase 1)" --body "<resumo + como foi testado + rodapé padrão>"
```
