# Contas Fixas MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o domínio "Contas Fixas" da planilha por um app web Next.js (fundação + CRUD completo + import do histórico), fonte de verdade para receitas/despesas fixas mês a mês.

**Architecture:** Next.js App Router — Server Components para leitura (Prisma direto) e Server Actions para escrita (validadas com Zod). Cálculos monetários e de domínio em módulos puros e testáveis (`lib/money.ts`, `lib/calc.ts`). Postgres (Supabase) via Prisma. Login single-user com Auth.js (Google + allowlist).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 3 + shadcn/ui, Recharts 2, Prisma 6 + PostgreSQL (Supabase), Auth.js (next-auth@5), Zod 3, Vitest 2, Playwright 1.4x, SheetJS (`xlsx`) para o import.

## Global Constraints

- **Node:** 20+.
- **Dinheiro:** todo cálculo em **centavos inteiros** (`lib/money.ts`). Nunca somar `Decimal`/float diretamente. Armazenar em `Decimal(12,2)` no banco.
- **Locale:** toda formatação de moeda/data em **pt-BR** (`Intl`, `currency: "BRL"`).
- **Competência:** representada externamente como string `YYYY-MM`; no banco como `Date` no **dia 1, meia-noite UTC**.
- **Auth:** single-user. Nenhum e-mail hardcoded — allowlist sempre via env `ALLOWED_EMAILS` (lista separada por vírgula).
- **Segredos:** apenas em env/gerenciador de segredos da Vercel. `.env` no `.gitignore`; versionar só `.env.example`.
- **Commits:** frequentes (um por tarefa concluída). Todo commit termina com o trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Testes:** `npm test` roda Vitest. TDD: teste falha primeiro, depois implementação mínima.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `playwright.config.ts` | tooling e configuração |
| `.env.example`, `.gitignore` | template de env e ignorados |
| `prisma/schema.prisma` | modelo de dados (Category, Item, MonthlyEntry) + migrations |
| `lib/prisma.ts` | client Prisma (singleton) |
| `lib/money.ts` | aritmética em centavos + formatação BRL |
| `lib/calc.ts` | funções puras de domínio (totais, saldo, falta-pagar, ranking, agregação) |
| `lib/validators.ts` | schemas Zod compartilhados |
| `lib/import-normalize.ts` | normalizadores puros do import (valores/dia/categoria) |
| `lib/auth.ts` | config Auth.js + `isEmailAllowed` |
| `lib/dates.ts` | helpers de competência (`monthToDate`, `formatCompetencia`) |
| `middleware.ts` | protege rotas do grupo `(app)` |
| `scripts/import.ts` | import único da planilha (`npm run import`) |
| `app/(auth)/login/page.tsx` | login |
| `app/acesso-negado/page.tsx` | e-mail fora da allowlist |
| `app/(app)/layout.tsx` | layout autenticado + navegação |
| `app/(app)/dashboard/page.tsx` | dashboard (cards, gráficos, ranking, projeção) |
| `app/(app)/mes/page.tsx` + `actions.ts` | lançamentos do mês + server actions |
| `app/(app)/itens/page.tsx` + `actions.ts` | CRUD de itens |
| `app/(app)/categorias/page.tsx` + `actions.ts` | CRUD de categorias |
| `app/api/auth/[...nextauth]/route.ts` | handler Auth.js |
| `components/ui/*` | componentes shadcn |
| `tests/e2e/*.spec.ts` | Playwright (caminho crítico) |

---

## Task 1: Scaffold do projeto e tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: projeto Next.js executável (`npm run dev`) e runner de testes (`npm test`).

- [ ] **Step 1: Inicializar git (com remote) e projeto**

```bash
git init
git remote add origin https://github.com/cassoli2016/controle_gastos.git
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm --yes
```

> O repositório remoto (`cassoli2016/controle_gastos`) pode já ter conteúdo (README/licença). Se o `create-next-app` reclamar de diretório não vazio, resolver localmente; o primeiro push usará `git push -u origin main` (ou `--force` só se o remoto estiver vazio/descartável). Push apenas quando o usuário pedir.

- [ ] **Step 2: Adicionar dependências de teste e libs base**

```bash
npm install zod @prisma/client next-auth@beta recharts xlsx
npm install -D prisma vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test tsx
```

- [ ] **Step 3: Configurar Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "import": "tsx scripts/import.ts",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 4: Escrever o smoke test (falha primeiro)**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("soma básica", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Rodar o teste**

Run: `npm test`
Expected: PASS (1 teste).

- [ ] **Step 6: Garantir `.gitignore` e `.env.example`**

`.gitignore` deve conter `.env`, `node_modules`, `.next`. Create `.env.example`:

```
# Supabase → Project Settings → Database → Connection string
# DATABASE_URL = pooled (Transaction, porta 6543) — usada pela app em runtime
DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
# DIRECT_URL = conexão direta (porta 5432) — usada pelas migrations do Prisma
DIRECT_URL="postgresql://postgres.<ref>:<senha>@aws-0-<region>.pooler.supabase.com:5432/postgres"
AUTH_SECRET="gerar-com-npx-auth-secret"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
ALLOWED_EMAILS="seu-email@exemplo.com"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + tooling (vitest, prisma, auth, tailwind)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `lib/money.ts` — aritmética monetária em centavos

**Files:**
- Create: `lib/money.ts`
- Test: `tests/money.test.ts`

**Interfaces:**
- Produces:
  - `decimalToCents(value: number | string): number`
  - `centsToNumber(cents: number): number`
  - `sumCents(values: number[]): number`
  - `formatCents(cents: number): string`
  - `parseBRLToCents(input: string): number`

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Create `tests/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decimalToCents, centsToNumber, sumCents, formatCents, parseBRLToCents } from "@/lib/money";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("money", () => {
  it("decimalToCents", () => {
    expect(decimalToCents(1383.42)).toBe(138342);
    expect(decimalToCents("220")).toBe(22000);
    expect(decimalToCents(0)).toBe(0);
  });
  it("centsToNumber", () => {
    expect(centsToNumber(138342)).toBeCloseTo(1383.42, 2);
  });
  it("sumCents", () => {
    expect(sumCents([100, 200, 50])).toBe(350);
    expect(sumCents([])).toBe(0);
  });
  it("formatCents em BRL", () => {
    expect(nbsp(formatCents(138342))).toBe("R$ 1.383,42");
    expect(nbsp(formatCents(0))).toBe("R$ 0,00");
  });
  it("parseBRLToCents aceita formatos variados", () => {
    expect(parseBRLToCents("1.383,42")).toBe(138342);
    expect(parseBRLToCents("1383.42")).toBe(138342);
    expect(parseBRLToCents(" R$ 449 ")).toBe(44900);
    expect(parseBRLToCents(" 449")).toBe(44900);
  });
  it("parseBRLToCents lança em valor inválido", () => {
    expect(() => parseBRLToCents("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/money.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/money.ts`**

```ts
/** Converte um Decimal/valor numérico em centavos inteiros. */
export function decimalToCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  return Math.round(n * 100);
}

/** Converte centavos inteiros para reais (número). */
export function centsToNumber(cents: number): number {
  return cents / 100;
}

/** Soma valores em centavos. */
export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Formata centavos como moeda BRL. Ex.: 138342 -> "R$ 1.383,42". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** Faz parse de uma string BRL/decimal em centavos. Ex.: "1.383,42" -> 138342. */
export function parseBRLToCents(input: string): number {
  const cleaned = input.replace(/R\$/g, "").replace(/[\s ]/g, "").trim();
  if (cleaned === "") throw new Error("Valor monetário vazio");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  if (Number.isNaN(n)) throw new Error(`Valor monetário inválido: ${input}`);
  return Math.round(n * 100);
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/money.ts tests/money.test.ts
git commit -m "feat: money utils em centavos com formatação/parse BRL" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `lib/calc.ts` — cálculos de domínio

**Files:**
- Create: `lib/calc.ts`
- Test: `tests/calc.test.ts`

**Interfaces:**
- Consumes: `sumCents` de `@/lib/money`.
- Produces:
  - type `EntryView = { itemName: string; categoryName: string; categoryType: "INCOME" | "EXPENSE"; plannedCents: number; paid: boolean; paidCents: number | null }`
  - `plannedIncome(e: EntryView[]): number`
  - `plannedExpense(e: EntryView[]): number`
  - `plannedBalance(e: EntryView[]): number`
  - `remainingToPay(e: EntryView[]): number`
  - `expenseRanking(e: EntryView[]): { itemName: string; cents: number }[]`
  - `expenseByCategory(e: EntryView[]): { categoryName: string; cents: number }[]`

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Create `tests/calc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  plannedIncome, plannedExpense, plannedBalance, remainingToPay,
  expenseRanking, expenseByCategory, type EntryView,
} from "@/lib/calc";

const E: EntryView[] = [
  { itemName: "SALÁRIO", categoryName: "Renda", categoryType: "INCOME", plannedCents: 2500000, paid: true, paidCents: 2500000 },
  { itemName: "YOUTUBE", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 6000, paid: true, paidCents: 6000 },
  { itemName: "ESTACIONAMENTO", categoryName: "Transporte", categoryType: "EXPENSE", plannedCents: 22000, paid: false, paidCents: null },
  { itemName: "PS PLUS", categoryName: "Assinaturas", categoryType: "EXPENSE", plannedCents: 59000, paid: false, paidCents: null },
];

describe("calc", () => {
  it("plannedIncome", () => expect(plannedIncome(E)).toBe(2500000));
  it("plannedExpense", () => expect(plannedExpense(E)).toBe(87000));
  it("plannedBalance", () => expect(plannedBalance(E)).toBe(2413000));
  it("remainingToPay soma só despesas não pagas", () => expect(remainingToPay(E)).toBe(81000));
  it("expenseRanking ordena desc", () => {
    expect(expenseRanking(E)).toEqual([
      { itemName: "PS PLUS", cents: 59000 },
      { itemName: "ESTACIONAMENTO", cents: 22000 },
      { itemName: "YOUTUBE", cents: 6000 },
    ]);
  });
  it("expenseByCategory agrega e ordena desc", () => {
    expect(expenseByCategory(E)).toEqual([
      { categoryName: "Assinaturas", cents: 65000 },
      { categoryName: "Transporte", cents: 22000 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/calc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/calc.ts`**

```ts
import { sumCents } from "@/lib/money";

export type EntryView = {
  itemName: string;
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
};

const income = (e: EntryView[]) => e.filter((x) => x.categoryType === "INCOME");
const expense = (e: EntryView[]) => e.filter((x) => x.categoryType === "EXPENSE");

export function plannedIncome(e: EntryView[]): number {
  return sumCents(income(e).map((x) => x.plannedCents));
}
export function plannedExpense(e: EntryView[]): number {
  return sumCents(expense(e).map((x) => x.plannedCents));
}
export function plannedBalance(e: EntryView[]): number {
  return plannedIncome(e) - plannedExpense(e);
}
/** Soma dos previstos de despesas ainda não pagas. */
export function remainingToPay(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => !x.paid).map((x) => x.plannedCents));
}
export function expenseRanking(e: EntryView[]): { itemName: string; cents: number }[] {
  return expense(e)
    .map((x) => ({ itemName: x.itemName, cents: x.plannedCents }))
    .sort((a, b) => b.cents - a.cents);
}
export function expenseByCategory(e: EntryView[]): { categoryName: string; cents: number }[] {
  const map = new Map<string, number>();
  for (const x of expense(e)) map.set(x.categoryName, (map.get(x.categoryName) ?? 0) + x.plannedCents);
  return [...map.entries()]
    .map(([categoryName, cents]) => ({ categoryName, cents }))
    .sort((a, b) => b.cents - a.cents);
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/calc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calc.ts tests/calc.test.ts
git commit -m "feat: cálculos de domínio (totais, saldo, falta-pagar, ranking, por categoria)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `lib/validators.ts` e `lib/dates.ts`

**Files:**
- Create: `lib/validators.ts`, `lib/dates.ts`
- Test: `tests/validators.test.ts`, `tests/dates.test.ts`

**Interfaces:**
- Produces (validators): `categorySchema`, `itemSchema`, `entryUpsertSchema`, `markPaidSchema` (Zod).
- Produces (dates):
  - `monthToDate(month: string): Date` — "2026-08" -> `Date(Date.UTC(2026, 7, 1))`
  - `formatCompetencia(d: Date): string` — `Date` -> "ago/2026"
  - `monthStringFromDate(d: Date): string` — `Date` -> "2026-08"

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Create `tests/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";

describe("dates", () => {
  it("monthToDate cria dia 1 UTC", () => {
    const d = monthToDate("2026-08");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(1);
  });
  it("monthStringFromDate", () => {
    expect(monthStringFromDate(new Date(Date.UTC(2026, 7, 1)))).toBe("2026-08");
  });
  it("formatCompetencia em pt-BR", () => {
    expect(formatCompetencia(new Date(Date.UTC(2026, 7, 1))).toLowerCase()).toContain("ago");
  });
});
```

Create `tests/validators.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categorySchema, itemSchema, entryUpsertSchema, markPaidSchema } from "@/lib/validators";

describe("validators", () => {
  it("categorySchema aceita válido", () => {
    expect(categorySchema.safeParse({ name: "Saúde", type: "EXPENSE", color: "#22c55e" }).success).toBe(true);
  });
  it("categorySchema rejeita cor inválida e nome vazio", () => {
    expect(categorySchema.safeParse({ name: "", type: "EXPENSE", color: "verde" }).success).toBe(false);
  });
  it("itemSchema aceita dueDay 1..31 e nulo", () => {
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: 3, active: true }).success).toBe(true);
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: null }).success).toBe(true);
    expect(itemSchema.safeParse({ name: "Youtube", categoryId: "c1", dueDay: 40 }).success).toBe(false);
  });
  it("entryUpsertSchema valida competência YYYY-MM", () => {
    expect(entryUpsertSchema.safeParse({ itemId: "i1", month: "2026-08", plannedAmount: 220 }).success).toBe(true);
    expect(entryUpsertSchema.safeParse({ itemId: "i1", month: "2026/08", plannedAmount: 220 }).success).toBe(false);
  });
  it("markPaidSchema", () => {
    expect(markPaidSchema.safeParse({ entryId: "e1", paid: true, paidAmount: 220, paidDate: "2026-08-05" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/dates.test.ts tests/validators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/dates.ts`**

```ts
export function monthToDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
export function monthStringFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
export function formatCompetencia(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}
```

- [ ] **Step 4: Implementar `lib/validators.ts`**

```ts
import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
});

export const itemSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  categoryId: z.string().min(1, "Categoria obrigatória"),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().trim().optional(),
});

export const entryUpsertSchema = z.object({
  itemId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
  plannedAmount: z.coerce.number().nonnegative(),
});

export const markPaidSchema = z.object({
  entryId: z.string().min(1),
  paid: z.boolean(),
  paidAmount: z.coerce.number().nonnegative().nullable().optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
```

- [ ] **Step 5: Rodar (deve passar)**

Run: `npx vitest run tests/dates.test.ts tests/validators.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validators.ts lib/dates.ts tests/validators.test.ts tests/dates.test.ts
git commit -m "feat: schemas Zod e helpers de competência" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Modelo de dados Prisma + client

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`
- Modify: `.env` (local, não versionar)

**Interfaces:**
- Produces: modelos `Category`, `Item`, `MonthlyEntry`, enum `CategoryType`; export `prisma` (PrismaClient singleton).

- [ ] **Step 1: Escrever `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum CategoryType {
  INCOME
  EXPENSE
}

model Category {
  id        String       @id @default(cuid())
  name      String
  type      CategoryType
  color     String
  createdAt DateTime     @default(now())
  items     Item[]
}

model Item {
  id         String        @id @default(cuid())
  name       String
  category   Category      @relation(fields: [categoryId], references: [id])
  categoryId String
  dueDay     Int?
  active     Boolean       @default(true)
  notes      String?
  createdAt  DateTime      @default(now())
  entries    MonthlyEntry[]

  @@index([categoryId])
}

model MonthlyEntry {
  id            String   @id @default(cuid())
  item          Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  itemId        String
  month         DateTime @db.Date
  plannedAmount Decimal  @db.Decimal(12, 2)
  paid          Boolean  @default(false)
  paidAmount    Decimal? @db.Decimal(12, 2)
  paidDate      DateTime? @db.Date

  @@unique([itemId, month])
  @@index([month])
}
```

- [ ] **Step 2: Configurar `.env` local com as connection strings do Supabase**

No painel do Supabase (Project Settings → Database → Connection string): copiar a **pooled** (porta 6543, `?pgbouncer=true`) para `DATABASE_URL` e a **direta** (porta 5432) para `DIRECT_URL` no `.env`. (Segredos — nunca commitar.)

- [ ] **Step 3: Rodar a migration**

Run: `npm run db:migrate -- --name init`
Expected: cria `prisma/migrations/*/migration.sql`, aplica no banco, gera o client. Sem erros.

- [ ] **Step 4: Implementar `lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Verificar geração do client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/prisma.ts
git commit -m "feat: schema Prisma (Category, Item, MonthlyEntry) + client singleton" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Autenticação (Auth.js + allowlist + middleware)

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `app/(auth)/login/page.tsx`, `app/acesso-negado/page.tsx`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces: `isEmailAllowed(email: string | null | undefined, allowlist: string): boolean`; exports `handlers`, `auth`, `signIn`, `signOut` do Auth.js.

- [ ] **Step 1: Escrever o teste do allowlist (falha primeiro)**

Create `tests/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "@/lib/auth-allowlist";

describe("isEmailAllowed", () => {
  const list = "a@x.com, B@x.com";
  it("aceita e-mail da lista (case-insensitive)", () => {
    expect(isEmailAllowed("a@x.com", list)).toBe(true);
    expect(isEmailAllowed("b@x.com", list)).toBe(true);
  });
  it("rejeita fora da lista, vazio e nulo", () => {
    expect(isEmailAllowed("c@x.com", list)).toBe(false);
    expect(isEmailAllowed("", list)).toBe(false);
    expect(isEmailAllowed(null, list)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/auth-allowlist.ts` (função pura, sem deps do next-auth)**

```ts
export function isEmailAllowed(email: string | null | undefined, allowlist: string): boolean {
  if (!email) return false;
  const allowed = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `lib/auth.ts` (config Auth.js)**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return isEmailAllowed(profile?.email, process.env.ALLOWED_EMAILS ?? "");
    },
  },
  pages: { signIn: "/login", error: "/acesso-negado" },
  session: { strategy: "jwt" },
});
```

- [ ] **Step 6: Implementar handler e middleware**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

Create `middleware.ts`:

```ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/mes/:path*", "/itens/:path*", "/categorias/:path*"],
};
```

- [ ] **Step 7: Implementar telas de login e acesso negado**

Create `app/(auth)/login/page.tsx`:

```tsx
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit" className="rounded-md border px-4 py-2">
          Entrar com Google
        </button>
      </form>
    </main>
  );
}
```

Create `app/acesso-negado/page.tsx`:

```tsx
export default function AcessoNegado() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p>Acesso negado: este e-mail não está autorizado.</p>
    </main>
  );
}
```

- [ ] **Step 8: Verificação manual + commit**

Run: `npm run dev`, acessar `/dashboard` sem sessão → deve redirecionar para `/login`. (E2E cobre isso na Task 12.)

```bash
git add lib/auth.ts lib/auth-allowlist.ts app/api/auth middleware.ts "app/(auth)" app/acesso-negado tests/auth.test.ts
git commit -m "feat: auth Google com allowlist + proteção de rotas" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Import da planilha

**Files:**
- Create: `lib/import-normalize.ts`, `scripts/import.ts`
- Test: `tests/import-normalize.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`, `monthToDate` de `@/lib/dates`.
- Produces:
  - `normalizeAmount(value: unknown): number | null`
  - `normalizeDueDay(value: unknown): number | null`
  - `keywordCategory(name: string): string`
  - `BASE_CATEGORIES: { name: string; type: "INCOME" | "EXPENSE"; color: string }[]`

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Create `tests/import-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeAmount, normalizeDueDay, keywordCategory } from "@/lib/import-normalize";

describe("import-normalize", () => {
  it("normalizeAmount trata número, string, NBSP e vazio", () => {
    expect(normalizeAmount(220)).toBe(220);
    expect(normalizeAmount(" 449")).toBe(449);
    expect(normalizeAmount("1.383,42")).toBe(1383.42);
    expect(normalizeAmount("")).toBeNull();
    expect(normalizeAmount(null)).toBeNull();
  });
  it("normalizeDueDay aceita string/número, rejeita fora de 1..31", () => {
    expect(normalizeDueDay("5")).toBe(5);
    expect(normalizeDueDay(7)).toBe(7);
    expect(normalizeDueDay(0)).toBeNull();
    expect(normalizeDueDay(40)).toBeNull();
    expect(normalizeDueDay("")).toBeNull();
  });
  it("keywordCategory mapeia por palavra-chave", () => {
    expect(keywordCategory("SALÁRIO")).toBe("Renda");
    expect(keywordCategory("SEGURO DUSTER 27/08")).toBe("Seguros");
    expect(keywordCategory("YOUTUBE")).toBe("Assinaturas");
    expect(keywordCategory("HANA TIREÓIDE")).toBe("Saúde");
    expect(keywordCategory("ESTACIONAMENTO")).toBe("Transporte");
    expect(keywordCategory("ALGO ALEATÓRIO")).toBe("Outros");
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/import-normalize.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/import-normalize.ts`**

```ts
export const BASE_CATEGORIES = [
  { name: "Renda", type: "INCOME", color: "#22c55e" },
  { name: "Moradia", type: "EXPENSE", color: "#3b82f6" },
  { name: "Saúde", type: "EXPENSE", color: "#ef4444" },
  { name: "Assinaturas", type: "EXPENSE", color: "#a855f7" },
  { name: "Transporte", type: "EXPENSE", color: "#f59e0b" },
  { name: "Seguros", type: "EXPENSE", color: "#14b8a6" },
  { name: "Outros", type: "EXPENSE", color: "#64748b" },
] as const;

export function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[\s ]/g, "").trim();
  if (cleaned === "") return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

export function normalizeDueDay(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return n;
}

const KEYWORD_MAP: { pattern: RegExp; category: string }[] = [
  { pattern: /sal[aá]rio|renda/i, category: "Renda" },
  { pattern: /seguro/i, category: "Seguros" },
  { pattern: /youtube|ps ?plus|investidor|spotify|netflix|prime|assinatura/i, category: "Assinaturas" },
  { pattern: /hana|audrey|vitamin|tire[oó]ide|sa[uú]de|farm[aá]cia|rem[eé]dio|dentista/i, category: "Saúde" },
  { pattern: /estacionamento|combust[ií]vel|uber|transporte|ped[aá]gio|gasolina/i, category: "Transporte" },
  { pattern: /aluguel|condom[ií]nio|luz|[aá]gua|energia|internet|iptu|moradia|g[aá]s/i, category: "Moradia" },
];

export function keywordCategory(name: string): string {
  for (const { pattern, category } of KEYWORD_MAP) if (pattern.test(name)) return category;
  return "Outros";
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/import-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `scripts/import.ts` (leitura da planilha + carga)**

```ts
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { BASE_CATEGORIES, normalizeAmount, normalizeDueDay, keywordCategory } from "@/lib/import-normalize";

const FILE = path.resolve(process.cwd(), "Contas Mensais.xlsx");
const SHEET = "Contas Fixas";
const RESET = process.argv.includes("--reset");

async function main() {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[SHEET];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true });

  // Linha 0 = cabeçalho: col 0 vazio, col 1 = "DIA PGTO", cols 2.. = competências (datas), penúltima "TOTAL", última "RANK".
  const header = rows[0] as unknown[];
  const monthCols: { col: number; month: string }[] = [];
  for (let c = 2; c < header.length; c++) {
    const h = header[c];
    if (h instanceof Date) monthCols.push({ col: c, month: monthStringFromDate(new Date(Date.UTC(h.getFullYear(), h.getMonth(), 1))) });
  }

  if (RESET) {
    await prisma.monthlyEntry.deleteMany();
    await prisma.item.deleteMany();
    await prisma.category.deleteMany();
  }

  // Semear categorias
  const catByName = new Map<string, string>();
  for (const c of BASE_CATEGORIES) {
    const created = await prisma.category.create({ data: { name: c.name, type: c.type, color: c.color } });
    catByName.set(c.name, created.id);
  }

  let importedTotalCents = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const name = typeof row[0] === "string" ? row[0].trim() : null;
    if (!name) continue;

    const categoryName = keywordCategory(name);
    const dueDay = normalizeDueDay(row[1]);
    const item = await prisma.item.create({
      data: { name, categoryId: catByName.get(categoryName)!, dueDay, active: true },
    });

    for (const { col, month } of monthCols) {
      const amount = normalizeAmount(row[col]);
      if (amount === null || amount === 0) continue;
      await prisma.monthlyEntry.create({
        data: { itemId: item.id, month: monthToDate(month), plannedAmount: amount, paid: false },
      });
      importedTotalCents += Math.round(amount * 100);
    }
  }

  console.log(`Import concluído. Total importado (previsto): ${(importedTotalCents / 100).toFixed(2)}`);
  console.log("Confira contra a soma dos TOTAIS da planilha; divergências indicam célula não parseada.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Rodar o import (contra o banco de dev)**

Run: `npm run import -- --reset`
Expected: log "Import concluído. Total importado…"; sem erros. Conferir no `npm run db:studio` que categorias/itens/lançamentos existem.

- [ ] **Step 7: Commit**

```bash
git add lib/import-normalize.ts scripts/import.ts tests/import-normalize.test.ts
git commit -m "feat: import único da aba Contas Fixas com normalização de valores" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Categorias — Server Actions + página

**Files:**
- Create: `app/(app)/categorias/page.tsx`, `app/(app)/categorias/actions.ts`, `app/(app)/layout.tsx`
- Test: `tests/validators.test.ts` (já cobre o schema; a integração é validada via e2e na Task 12)

**Interfaces:**
- Consumes: `prisma`, `categorySchema`.
- Produces (actions.ts): `createCategory(formData: FormData)`, `updateCategory(id: string, formData: FormData)`, `deleteCategory(id: string)`.

- [ ] **Step 1: Implementar o layout autenticado com navegação**

Create `app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b px-6 py-3">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/mes">Mês</Link>
        <Link href="/itens">Itens</Link>
        <Link href="/categorias">Categorias</Link>
        <form className="ml-auto" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `app/(app)/categorias/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validators";

export async function createCategory(formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.category.create({ data: parsed.data });
  revalidatePath("/categorias");
  return { ok: true };
}

export async function updateCategory(id: string, formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.category.update({ where: { id }, data: parsed.data });
  revalidatePath("/categorias");
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const count = await prisma.item.count({ where: { categoryId: id } });
  if (count > 0) return { error: "Categoria em uso por itens; recategorize antes de excluir." };
  await prisma.category.delete({ where: { id } });
  revalidatePath("/categorias");
  return { ok: true };
}
```

- [ ] **Step 3: Implementar `app/(app)/categorias/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma";
import { createCategory, deleteCategory } from "./actions";

export default async function CategoriasPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Categorias</h1>

      <form action={createCategory} className="flex flex-wrap items-end gap-3">
        <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
        <select name="type" className="border rounded px-2 py-1">
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
        <input name="color" type="color" defaultValue="#3b82f6" className="h-9 w-12" />
        <button type="submit" className="border rounded px-3 py-1">Adicionar</button>
      </form>

      <ul className="divide-y">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
            <span>{c.name}</span>
            <span className="text-sm text-gray-500">{c.type === "INCOME" ? "Receita" : "Despesa"}</span>
            <form className="ml-auto" action={async () => { "use server"; await deleteCategory(c.id); }}>
              <button type="submit" className="text-red-600 text-sm">Excluir</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, ir em `/categorias`, criar e excluir uma categoria de teste. Excluir categoria com itens deve mostrar erro (validado via e2e depois).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/categorias"
git commit -m "feat: CRUD de categorias + layout autenticado" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Itens — Server Actions + página

**Files:**
- Create: `app/(app)/itens/page.tsx`, `app/(app)/itens/actions.ts`

**Interfaces:**
- Consumes: `prisma`, `itemSchema`.
- Produces (actions.ts): `createItem(formData: FormData)`, `updateItem(id: string, formData: FormData)`, `archiveItem(id: string, active: boolean)`.

- [ ] **Step 1: Implementar `app/(app)/itens/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { itemSchema } from "@/lib/validators";

function parseItem(formData: FormData) {
  const rawDue = formData.get("dueDay");
  return itemSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    dueDay: rawDue === "" || rawDue === null ? null : rawDue,
    active: formData.get("active") !== null,
    notes: formData.get("notes") ?? undefined,
  });
}

export async function createItem(formData: FormData) {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.create({ data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function updateItem(id: string, formData: FormData) {
  const parsed = parseItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.item.update({ where: { id }, data: parsed.data });
  revalidatePath("/itens");
  return { ok: true };
}

export async function archiveItem(id: string, active: boolean) {
  await prisma.item.update({ where: { id }, data: { active } });
  revalidatePath("/itens");
  return { ok: true };
}
```

- [ ] **Step 2: Implementar `app/(app)/itens/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma";
import { createItem, archiveItem } from "./actions";

export default async function ItensPage() {
  const [items, categories] = await Promise.all([
    prisma.item.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Itens</h1>

      <form action={createItem} className="flex flex-wrap items-end gap-3">
        <input name="name" placeholder="Nome" required className="border rounded px-2 py-1" />
        <select name="categoryId" required className="border rounded px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="dueDay" type="number" min={1} max={31} placeholder="Dia pgto" className="border rounded px-2 py-1 w-24" />
        <button type="submit" className="border rounded px-3 py-1">Adicionar</button>
      </form>

      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Item</th><th>Categoria</th><th>Dia</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b">
              <td>{i.name}</td>
              <td>{i.category.name}</td>
              <td>{i.dueDay ?? "—"}</td>
              <td>{i.active ? "Ativo" : "Arquivado"}</td>
              <td className="text-right">
                <form action={async () => { "use server"; await archiveItem(i.id, !i.active); }}>
                  <button type="submit" className="text-sm text-blue-600">{i.active ? "Arquivar" : "Reativar"}</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verificação manual + commit**

Run: `npm run dev`, criar item, arquivar/reativar.

```bash
git add "app/(app)/itens"
git commit -m "feat: CRUD de itens (com categoria e dia de vencimento)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Mês / Lançamentos — Server Actions + página (coração)

**Files:**
- Create: `app/(app)/mes/page.tsx`, `app/(app)/mes/actions.ts`, `lib/entries.ts`
- Test: `tests/entries.test.ts`

**Interfaces:**
- Consumes: `prisma`, `entryUpsertSchema`, `markPaidSchema`, `monthToDate`, `decimalToCents`, funções de `lib/calc.ts`.
- Produces:
  - `lib/entries.ts`: `toEntryView(row): EntryView` — converte um lançamento (com item+categoria) do Prisma em `EntryView`.
  - `actions.ts`: `upsertEntry(formData)`, `markPaid(formData)`, `copyPreviousMonth(month: string)`.

- [ ] **Step 1: Escrever teste de `toEntryView` (falha primeiro)**

Create `tests/entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toEntryView } from "@/lib/entries";

describe("toEntryView", () => {
  it("converte lançamento do Prisma em EntryView em centavos", () => {
    const row = {
      plannedAmount: "220.00",
      paid: false,
      paidAmount: null,
      item: { name: "ESTACIONAMENTO", category: { name: "Transporte", type: "EXPENSE" } },
    };
    expect(toEntryView(row as never)).toEqual({
      itemName: "ESTACIONAMENTO",
      categoryName: "Transporte",
      categoryType: "EXPENSE",
      plannedCents: 22000,
      paid: false,
      paidCents: null,
    });
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/entries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/entries.ts`**

```ts
import { decimalToCents } from "@/lib/money";
import type { EntryView } from "@/lib/calc";

type PrismaEntryRow = {
  plannedAmount: string | number;
  paid: boolean;
  paidAmount: string | number | null;
  item: { name: string; category: { name: string; type: "INCOME" | "EXPENSE" } };
};

export function toEntryView(row: PrismaEntryRow): EntryView {
  return {
    itemName: row.item.name,
    categoryName: row.item.category.name,
    categoryType: row.item.category.type,
    plannedCents: decimalToCents(String(row.plannedAmount)),
    paid: row.paid,
    paidCents: row.paidAmount === null ? null : decimalToCents(String(row.paidAmount)),
  };
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `app/(app)/mes/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { entryUpsertSchema, markPaidSchema } from "@/lib/validators";
import { monthToDate } from "@/lib/dates";

export async function upsertEntry(formData: FormData) {
  const parsed = entryUpsertSchema.safeParse({
    itemId: formData.get("itemId"),
    month: formData.get("month"),
    plannedAmount: formData.get("plannedAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { itemId, month, plannedAmount } = parsed.data;
  await prisma.monthlyEntry.upsert({
    where: { itemId_month: { itemId, month: monthToDate(month) } },
    create: { itemId, month: monthToDate(month), plannedAmount },
    update: { plannedAmount },
  });
  revalidatePath("/mes");
  return { ok: true };
}

export async function markPaid(formData: FormData) {
  const parsed = markPaidSchema.safeParse({
    entryId: formData.get("entryId"),
    paid: formData.get("paid") === "true",
    paidAmount: formData.get("paidAmount") || null,
    paidDate: formData.get("paidDate") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { entryId, paid, paidAmount, paidDate } = parsed.data;
  await prisma.monthlyEntry.update({
    where: { id: entryId },
    data: {
      paid,
      paidAmount: paid ? paidAmount ?? undefined : null,
      paidDate: paid && paidDate ? new Date(paidDate + "T00:00:00Z") : null,
    },
  });
  revalidatePath("/mes");
  return { ok: true };
}

export async function copyPreviousMonth(month: string) {
  const target = monthToDate(month);
  const prev = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() - 1, 1));
  const prevEntries = await prisma.monthlyEntry.findMany({ where: { month: prev } });
  for (const e of prevEntries) {
    await prisma.monthlyEntry.upsert({
      where: { itemId_month: { itemId: e.itemId, month: target } },
      create: { itemId: e.itemId, month: target, plannedAmount: e.plannedAmount },
      update: {},
    });
  }
  revalidatePath("/mes");
  return { ok: true, copied: prevEntries.length };
}
```

- [ ] **Step 6: Implementar `app/(app)/mes/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { upsertEntry, markPaid, copyPreviousMonth } from "./actions";

export default async function MesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } } },
    orderBy: { item: { name: "asc" } },
  });
  const views = rows.map((r) => toEntryView(r as never));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">Lançamentos — {formatCompetencia(monthDate)}</h1>
        <form action={async () => { "use server"; await copyPreviousMonth(month); }}>
          <button type="submit" className="text-sm border rounded px-2 py-1">Copiar mês anterior</button>
        </form>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card label="Receitas" value={formatCents(plannedIncome(views))} />
        <Card label="Despesas" value={formatCents(plannedExpense(views))} />
        <Card label="Saldo" value={formatCents(plannedBalance(views))} />
        <Card label="Falta pagar" value={formatCents(remainingToPay(views))} />
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left border-b"><th>Item</th><th>Categoria</th><th>Previsto</th><th>Pago</th><th>Valor pago</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td>{r.item.name}</td>
              <td>{r.item.category.name}</td>
              <td>{formatCents(Math.round(Number(r.plannedAmount) * 100))}</td>
              <td>
                <form action={markPaid}>
                  <input type="hidden" name="entryId" value={r.id} />
                  <input type="hidden" name="paid" value={(!r.paid).toString()} />
                  <button type="submit">{r.paid ? "✅" : "⬜"}</button>
                </form>
              </td>
              <td>{r.paidAmount ? formatCents(Math.round(Number(r.paidAmount) * 100)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 7: Verificação manual + commit**

Run: `npm run dev`, ir em `/mes?month=2026-08`, marcar um item como pago e ver "Falta pagar" diminuir; testar "copiar mês anterior".

```bash
git add "app/(app)/mes" lib/entries.ts tests/entries.test.ts
git commit -m "feat: tela de lançamentos do mês (previsto/pago, totais, copiar mês)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Dashboard (cards + gráficos + ranking + projeção)

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `components/charts/ExpensePie.tsx`, `components/charts/BalanceProjection.tsx`

**Interfaces:**
- Consumes: `prisma`, `toEntryView`, funções de `lib/calc.ts`, `formatCents`, helpers de datas.
- Produces: página do dashboard com Recharts (client components para os gráficos).

- [ ] **Step 1: Implementar componentes de gráfico (client)**

Create `components/charts/ExpensePie.tsx`:

```tsx
"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export function ExpensePie({ data }: { data: { categoryName: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="categoryName" outerRadius={100}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `R$ ${(v / 100).toFixed(2)}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

Create `components/charts/BalanceProjection.tsx`:

```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function BalanceProjection({ data }: { data: { month: string; balance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v: number) => (v / 100).toFixed(0)} />
        <Tooltip formatter={(v: number) => `R$ ${(v / 100).toFixed(2)}`} />
        <Line type="monotone" dataKey="balance" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Implementar `app/(app)/dashboard/page.tsx`**

```tsx
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { BalanceProjection } from "@/components/charts/BalanceProjection";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } } },
  });
  const views = rows.map((r) => toEntryView(r as never));

  const catColor = new Map((await prisma.category.findMany()).map((c) => [c.name, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({ categoryName: x.categoryName, value: x.cents, color: catColor.get(x.categoryName) ?? "#64748b" }));

  // Projeção: saldo previsto dos próximos 6 meses
  const proj: { month: string; balance: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const d = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + k, 1));
    const r = await prisma.monthlyEntry.findMany({ where: { month: d }, include: { item: { include: { category: true } } } });
    proj.push({ month: formatCompetencia(d), balance: plannedBalance(r.map((x) => toEntryView(x as never))) });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard — {formatCompetencia(monthDate)}</h1>
      <div className="grid grid-cols-4 gap-3">
        <Card label="Receitas" value={formatCents(plannedIncome(views))} />
        <Card label="Despesas" value={formatCents(plannedExpense(views))} />
        <Card label="Saldo" value={formatCents(plannedBalance(views))} />
        <Card label="Falta pagar" value={formatCents(remainingToPay(views))} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <section><h2 className="mb-2 font-medium">Despesas por categoria</h2><ExpensePie data={pieData} /></section>
        <section><h2 className="mb-2 font-medium">Projeção de saldo</h2><BalanceProjection data={proj} /></section>
      </div>
      <section>
        <h2 className="mb-2 font-medium">Ranking de despesas</h2>
        <ol className="list-decimal pl-6">
          {expenseRanking(views).slice(0, 10).map((x, i) => (
            <li key={i} className="flex justify-between"><span>{x.itemName}</span><span>{formatCents(x.cents)}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verificação manual + commit**

Run: `npm run dev`, abrir `/dashboard?month=2026-08`; conferir cards, pizza, projeção e ranking com os dados importados.

```bash
git add "app/(app)/dashboard" components/charts
git commit -m "feat: dashboard com cards, gráficos, ranking e projeção" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: E2E Playwright — caminho crítico

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fluxo.spec.ts`
- Modify: `lib/auth.ts` (permitir bypass de auth em ambiente de teste via `E2E_BYPASS_AUTH`)

**Interfaces:**
- Consumes: app rodando em `localhost:3000` com banco de teste semeado.

- [ ] **Step 1: Configurar Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: { E2E_BYPASS_AUTH: "1" },
  },
});
```

- [ ] **Step 2: Adicionar bypass de auth para testes em `middleware.ts`**

Substituir o export do middleware por uma versão que libera quando `E2E_BYPASS_AUTH=1`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const bypass = process.env.E2E_BYPASS_AUTH === "1";

export default bypass
  ? () => NextResponse.next()
  : (auth as unknown as () => void);

export const config = {
  matcher: ["/dashboard/:path*", "/mes/:path*", "/itens/:path*", "/categorias/:path*"],
};
```

- [ ] **Step 3: Escrever o e2e do caminho crítico**

Create `tests/e2e/fluxo.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("criar categoria, item e marcar lançamento como pago", async ({ page }) => {
  // Categoria
  await page.goto("/categorias");
  await page.fill('input[name="name"]', "Teste E2E");
  await page.click('button:has-text("Adicionar")');
  await expect(page.locator("text=Teste E2E")).toBeVisible();

  // Item
  await page.goto("/itens");
  await page.fill('input[name="name"]', "Item E2E");
  await page.click('button:has-text("Adicionar")');
  await expect(page.locator("text=Item E2E")).toBeVisible();

  // Dashboard responde
  await page.goto("/dashboard?month=2026-08");
  await expect(page.locator("text=Dashboard")).toBeVisible();
});
```

- [ ] **Step 4: Rodar o e2e**

Run: `npm run e2e`
Expected: 1 teste PASS (com banco de dev/teste populado).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e middleware.ts
git commit -m "test: e2e Playwright do caminho crítico + bypass de auth em teste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Deploy (após o MVP verde)

- [ ] Criar projeto na Vercel, conectar o repositório.
- [ ] Configurar env vars na Vercel: `DATABASE_URL` + `DIRECT_URL` (Supabase), `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`.
- [ ] Configurar OAuth do Google (redirect URI `https://<app>.vercel.app/api/auth/callback/google`).
- [ ] Rodar `prisma migrate deploy` no build (`"build": "prisma generate && prisma migrate deploy && next build"`).
- [ ] Deploy e smoke test manual: login, dashboard, lançamento.

---

## Self-Review (feita)

- **Cobertura da spec:** papel do app (substituir → CRUD Tasks 8–10), login Google+allowlist (Task 6), previsto+pago+valor real+data (Task 10 `markPaid` + schema Task 4), categorias receita/despesa (Tasks 4/5/8), import com normalização e idempotência `--reset` (Task 7), dinheiro em centavos (Task 2), telas dashboard/mês/itens/categorias/login/acesso-negado (Tasks 6–11), erros via Zod (Tasks 8–10), testes Vitest+Playwright (Tasks 2–7, 10, 12). Sem lacunas.
- **Placeholders:** nenhum "TBD/TODO"; todo passo com código tem o código.
- **Consistência de tipos:** `EntryView` definido na Task 3 e consumido igual nas Tasks 10/11; `toEntryView` (Task 10) casa com a assinatura; `isEmailAllowed`/`monthToDate`/`decimalToCents` usados com as assinaturas declaradas.

---

# ADENDO — Passada de Completude da UI (Tasks 13–16)

Traz a tela do mês e o CRUD ao que a spec aprovada previa. Stack real: Next 16, React 19, Prisma 7 (driver adapter), Zod 4, Recharts 3, Tailwind v4. Padrões já estabelecidos: dinheiro em centavos (`lib/money`), pt-BR, competência dia 1 UTC, Server Actions com Zod + `revalidatePath`, sem shadcn (HTML+Tailwind). **Novidade permitida:** para exibir erros de validação e capturar inputs ricos, criar **client components** usando `useActionState` (React 19) — as Server Actions retornam `{ error?: string; ok?: boolean }`.

## Task 13: Helpers de agrupamento/intervalo + navegador de mês

**Files:**
- Modify: `lib/calc.ts` (add `groupByCategory` + type `CategoryGroup`)
- Modify: `lib/dates.ts` (add `monthRange`)
- Create: `components/MonthNav.tsx` (client)
- Test: `tests/grouping.test.ts`, e amplia `tests/dates.test.ts`

**Interfaces (produce):**
- `CategoryGroup<T> = { categoryName: string; categoryType: "INCOME"|"EXPENSE"; rows: T[]; subtotalCents: number }`
- `groupByCategory<T extends { categoryName: string; categoryType: "INCOME"|"EXPENSE"; plannedCents: number }>(rows: T[]): CategoryGroup<T>[]` — agrupa por categoria; income antes de expense; dentro do mesmo tipo, subtotal desc.
- `monthRange(from: string, to: string): string[]` — lista "YYYY-MM" inclusiva; vazio se `to` < `from`.
- `MonthNav({ month, basePath }: { month: string; basePath: string })` — client component com ‹ anterior, `<input type="month">`, próximo › que navega via `useRouter().push(`${basePath}?month=${m}`)`.

- [ ] **Step 1: Testes (TDD, RED)** — `tests/grouping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { groupByCategory } from "@/lib/calc";
const rows = [
  { categoryName: "Renda", categoryType: "INCOME" as const, plannedCents: 2500000 },
  { categoryName: "Assinaturas", categoryType: "EXPENSE" as const, plannedCents: 6000 },
  { categoryName: "Assinaturas", categoryType: "EXPENSE" as const, plannedCents: 59000 },
  { categoryName: "Transporte", categoryType: "EXPENSE" as const, plannedCents: 22000 },
];
describe("groupByCategory", () => {
  it("agrupa, soma subtotais e ordena (income primeiro, depois subtotal desc)", () => {
    const g = groupByCategory(rows);
    expect(g.map((x) => x.categoryName)).toEqual(["Renda", "Assinaturas", "Transporte"]);
    expect(g[0].subtotalCents).toBe(2500000);
    expect(g[1].subtotalCents).toBe(65000);
    expect(g[1].rows.length).toBe(2);
  });
});
```
E em `tests/dates.test.ts` acrescente:
```ts
import { monthRange } from "@/lib/dates";
describe("monthRange", () => {
  it("intervalo inclusivo", () => {
    expect(monthRange("2026-08", "2026-11")).toEqual(["2026-08","2026-09","2026-10","2026-11"]);
  });
  it("mês único e intervalo invertido", () => {
    expect(monthRange("2026-08", "2026-08")).toEqual(["2026-08"]);
    expect(monthRange("2026-11", "2026-08")).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementar** `groupByCategory` em `lib/calc.ts` (usar `sumCents` para subtotais) e `monthRange` em `lib/dates.ts` (iterar com `d.setUTCMonth(d.getUTCMonth()+1)`).
- [ ] **Step 3: `components/MonthNav.tsx`** (client, `"use client"`): recebe `month`/`basePath`, calcula mês anterior/próximo com as mesmas regras UTC, renderiza links (`<Link href={`${basePath}?month=...`}>`) e um `<input type="month" defaultValue={month} onChange=... >` que faz `router.push`.
- [ ] **Step 4:** `npx vitest run tests/grouping.test.ts tests/dates.test.ts` (GREEN), `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 5: Commit** (trailer).

## Task 14: Tela do mês — agrupamento, subtotais, dia venc, empty-state, navegação

**Files:** Modify `app/(app)/mes/page.tsx`.

**Consome:** `groupByCategory` (Task 13), `MonthNav` (Task 13), `toEntryView`/`lib/calc`/`formatCents`/`lib/dates` (existentes).

Requisitos:
- No topo, renderizar `<MonthNav month={month} basePath="/mes" />` (além do botão "copiar mês anterior").
- Montar linhas de exibição a partir do Prisma incluindo: `entryId`, `itemId`, `itemName`, `categoryName`, `categoryType`, `dueDay`, `plannedCents`, `paid`, `paidCents`, `paidDate`. (Buscar `item.dueDay` e `item.category`.)
- Agrupar com `groupByCategory`; renderizar uma seção por categoria com cabeçalho (nome + tipo) e **subtotal** (`formatCents`); dentro, uma linha por item com colunas: item, **dia venc** (`dueDay ?? "—"`), previsto, status pago, valor pago.
- **Empty-state:** se não houver lançamentos no mês, mostrar mensagem ("Nenhum lançamento neste mês") + botão "copiar mês anterior".
- Manter os cards de totais (receitas/despesas/saldo/falta pagar). Manter o `markPaid` atual (será enriquecido na Task 15).
- Não reimplementar conversão Decimal→cents inline: usar `decimalToCents`/`toEntryView`.

- [ ] Passos: implementar a página; `npx tsc --noEmit`; `npm run build`; `npm test`; commit (trailer). Verificação funcional logada fica para teste manual do usuário (e2e adiado).

## Task 15: Tela do mês — interações de escrita (client + useActionState)

**Files:**
- Modify: `app/(app)/mes/actions.ts` (enriquecer `markPaid`; add `applyRange`)
- Create: client components em `app/(app)/mes/` (ex.: `PayCell.tsx`, `AddEntryForm.tsx`, `PlannedCell.tsx`, `BulkApplyForm.tsx`)
- Modify: `app/(app)/mes/page.tsx` para usar esses componentes.

**Consome:** `entryUpsertSchema`, `markPaidSchema` (existentes), `monthRange` (Task 13), `formatCents`.

Requisitos:
- **Marcar pago com valor/data:** substituir o toggle simples por um client component (`PayCell`, `useActionState`) que, quando NÃO pago, mostra input de **valor** (default = previsto, em reais) + input **data** (`type="date"`, default hoje) + botão "Pagar" → chama `markPaid` com `paidAmount`/`paidDate`; quando pago, mostra valor/data + botão "Desmarcar" (`markPaid` com `paid=false`). Exibir `{error}` retornado.
  - `markPaid` deve converter o valor (reais) recebido do form para o Decimal do banco corretamente (o form envia reais tipo "220,50" ou "220.50"; parsear com `parseBRLToCents` e gravar como decimal, ou aceitar número). Mantenha `markPaidSchema` (ajuste o schema se precisar aceitar o formato do input, preservando o comportamento).
- **Adicionar lançamento ao mês:** `AddEntryForm` (client) — `<select>` de Itens ativos que ainda NÃO têm lançamento no mês + input valor → `upsertEntry`. Exibir erro.
- **Editar previsto inline:** `PlannedCell` (client) — input com o valor previsto atual → `upsertEntry` ao salvar. Exibir erro.
- **Aplicar valor de X até Y (lote):** `BulkApplyForm` (client) — select Item + de-mês (`type="month"`) + até-mês + valor → nova action `applyRange(prev, formData)` que valida (Zod) e faz `upsertEntry` para cada mês de `monthRange(from,to)`. `revalidatePath("/mes")`. Exibir erro/quantidade aplicada.
- Todas as Server Actions retornam `{ error?: string; ok?: boolean }` e os client components usam `useActionState` para exibir.
- A página passa aos componentes os Itens disponíveis e os dados de cada linha.

- [ ] Passos: implementar actions + componentes + fiação na página; `npx tsc --noEmit`; `npm run build`; `npm test`; commit (trailer). Se ficar grande demais, reportar DONE_WITH_CONCERNS ou pedir split.

## Task 16: Categorias & Itens — exibição de erros + edição (CRUD completo)

**Files:** Modify `app/(app)/categorias/page.tsx`, `app/(app)/itens/page.tsx` (e extrair client components conforme necessário, ex.: `CategoryRow.tsx`, `ItemRow.tsx`, `NewCategoryForm.tsx`, `NewItemForm.tsx`).

Requisitos:
- Converter os forms de criar/excluir/arquivar para **client components com `useActionState`**, exibindo o `{error}` (ex.: "Categoria em uso por itens; recategorize antes de excluir." deve aparecer na tela).
- Adicionar **edição inline**: wire `updateCategory` (nome/tipo/cor) e `updateItem` (nome/categoria/dia/ativo) via forms de edição por linha. Ao editar item, incluir controle de `active` (para não recair no bug de arquivamento — enviar `active` explicitamente).
- Manter Server Actions retornando `{ error?, ok? }`.

- [ ] Passos: implementar; `npx tsc --noEmit`; `npm run build`; `npm test`; commit (trailer).

## Task 12 (E2E) — ADIADA

Decisão do usuário: adiar o e2e até a UI estabilizar; rodar depois contra um banco de teste separado. Não executar agora.
