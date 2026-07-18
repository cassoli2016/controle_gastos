# Fase A — Cartões, Parcelamento e Edição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Cartões (2+), lançar compras por cartão, parcelamento que gera N lançamentos automaticamente, e editar/excluir lançamentos e parcelamentos — sem quebrar Contas Fixas. Ver spec `2026-07-18-cartoes-parcelamento-edicao-design.md`.

**Architecture:** Migração aditiva (nova entidade `CreditCard`; `MonthlyEntry` ganha `description/categoryId/cardId/installment*` e `itemId` opcional). Domínio testável (`lib/installments.ts`, validators, `lib/entries.ts`). Novas Server Actions (cartões, createPurchase, deleteEntry, updateInstallment, deleteInstallment). UI shadcn (tela `/cartoes`, dialog de compra, integração no Mês) reusando `CurrencyInput`/`useActionToast`/`Dialog`/`AlertDialog`.

**Tech Stack:** Next 16, React 19, TS, Tailwind v4, Prisma 7 + Supabase, shadcn/ui, sonner, Vitest.

## Global Constraints

- **Não quebrar Contas Fixas** (item-based). Migração ADITIVA; `@@unique([itemId, month])` mantido (Postgres: NULL distinto permite várias avulsas/mês).
- Dinheiro: `Decimal(12,2)` reais no banco; centavos na exibição; `CurrencyInput` submete reais. pt-BR.
- Toasts via `useActionToast`; tema claro/escuro; sem shadcn extra sem necessidade.
- **Verificação por task:** `npx tsc --noEmit` + `npm run build` + `npm test` + `npm run lint` verdes.
- Commits terminam com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1 (CONTROLLER): Migração + seed

**Files:** `prisma/schema.prisma`, migration, seed.

- [ ] Adicionar model `CreditCard { id, name, color, active @default(true), createdAt, entries MonthlyEntry[] }`.
- [ ] `MonthlyEntry`: `itemId String?` (opcional) + `item Item?`; add `description String?`, `categoryId String?` + `category Category?`, `cardId String?` + `card CreditCard? @relation(onDelete: SetNull)`, `installmentId String?`, `installmentSeq Int?`, `installmentCount Int?`; índices `@@index([cardId])`, `@@index([installmentId])`. Back-relations em `Item`, `Category`, `CreditCard`.
- [ ] `prisma migrate dev --name cards-installments` (DIRECT_URL). Confirmar tabela/colunas.
- [ ] Seed categoria "Cartão/Compras" (EXPENSE, cor `#64748b`) se não existir.

## Task 2: Domínio — installments + validators + entries (TDD)

**Files:** Create `lib/installments.ts`, `tests/installments.test.ts`; modify `lib/validators.ts`, `lib/entries.ts` (+ `tests/entries.test.ts`).

- [ ] **`lib/installments.ts`** (TDD):
```ts
import { monthRange } from "@/lib/dates";
export function installmentMonths(startMonth: string, count: number): string[] {
  if (count < 1) return [];
  const [y, m] = startMonth.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + (count - 1), 1));
  const endMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  return monthRange(startMonth, endMonth);
}
```
Testes: `installmentMonths("2026-08",3)===["2026-08","2026-09","2026-10"]`; count 1 → `["2026-08"]`; count 0 → `[]`; virada de ano `("2026-11",3)===["2026-11","2026-12","2027-01"]`.

- [ ] **`lib/validators.ts`** add:
```ts
export const cardSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex #RRGGBB"),
});
export const purchaseSchema = z.object({
  cardId: z.string().trim().optional().nullable(),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  categoryId: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  installments: z.coerce.number().int().min(1).max(120),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/, "Competência YYYY-MM"),
});
```
Testes: caso válido; amount 0 → inválido; installments 0/121 → inválido; description vazia → inválido.

- [ ] **`lib/entries.ts`** — `toEntryView` passa a aceitar entradas avulsas: `itemName = row.item?.name ?? row.description ?? "—"`; `categoryName/type` de `row.item?.category ?? row.category`. Atualizar o tipo `PrismaEntryRow` (item opcional, `description`, `category`). Ajustar/estender `tests/entries.test.ts` (um caso item-based e um avulso). Não quebrar o caso existente.

## Task 3: Cartões CRUD (/cartoes) + navegação

**Files:** `app/(app)/cartoes/{page.tsx,actions.ts}`, componentes client (`NewCardForm`, `CardRow`), `components/app-shell/NavItems.ts` (+ item "Cartões", ícone `CreditCard`).

- [ ] `actions.ts`: `createCard/updateCard/archiveCard` `(prevState, formData) => ActionState` (Zod `cardSchema`, `revalidatePath`).
- [ ] Tela estilo shadcn (Table desktop / cards mobile), Dialog criar/editar, AlertDialog arquivar, toasts (`useActionToast`). Chip de cor + nome + status.
- [ ] Add "Cartões" ao `NavItems` (aparece na sidebar/bottom-nav).

## Task 4: createPurchase + Dialog "Lançar compra / parcelamento"

**Files:** `app/(app)/mes/actions.ts` (add `createPurchase`), client `PurchaseDialog.tsx` (reutilizável), fiar na tela do Mês (e depois na de Cartões, Task 6).

- [ ] `createPurchase(prevState, formData)`: valida `purchaseSchema`; resolve `categoryId` (se vazio → categoria "Cartão/Compras"); gera `installmentMonths(startMonth, installments)`; numa `$transaction`, cria N `MonthlyEntry` com `installmentId` (cuid), `installmentSeq` 1..N, `installmentCount`=N, `description`, `categoryId`, `cardId?`, `plannedAmount`=amount, `month`=cada mês. `revalidatePath("/mes")` e `/cartoes`. Retorna `{ ok, count }`.
- [ ] `PurchaseDialog` (client): `Button` "Lançar compra" abre Dialog com `Select cardId` (opcional, lista cartões ativos + "sem cartão"), `Input description`, `Select categoryId` (opcional), `CurrencyInput amount`, `Input number installments` (default 1), `Input month startMonth` (default mês atual). `useActionState(createPurchase)` + `useActionToast(success: (s)=>\`Compra em ${s.count} parcela(s) lançada.\`)`. Fecha ao sucesso. Recebe cards e categories da page.
- [ ] Adicionar o gatilho na tela do Mês (ações do topo).

## Task 5: Mês mostra avulsos/cartão + excluir + editar/excluir parcelamento

**Files:** `app/(app)/mes/page.tsx`, `app/(app)/mes/actions.ts` (add `deleteEntry/updateInstallment/deleteInstallment`), componentes (`EntryActions`/`InstallmentDialog`).

- [ ] Actions: `deleteEntry(prevState, formData)` (exclui por id); `updateInstallment(prevState, formData)` (atualiza `plannedAmount` das parcelas `paid=false` de um `installmentId`); `deleteInstallment(prevState, formData)` (exclui todas parcelas do `installmentId`). Todas com `revalidatePath`, toasts.
- [ ] `page.tsx`/linha: entradas avulsas mostram descrição + badge do cartão (se houver) + "X/N" quando parcelado. Ações por linha: **excluir** (AlertDialog) e, se parcelado, **editar/excluir parcelamento** (Dialog/AlertDialog). Editar valor/pago reutiliza `PlannedCell`/`PayCell`. Ajustar a query da page para incluir `card`, `category`, campos de parcelamento, e mapear via `toEntryView` estendido.

## Task 6: Cartões — fatura-lite (total do mês + compras por cartão)

**Files:** `app/(app)/cartoes/page.tsx` (estender), reutilizar `PurchaseDialog`, `MonthNav`, `StatCard`.

- [ ] Na tela de Cartões, com `MonthNav`: por cartão ativo, mostrar o **total do mês** (soma dos `MonthlyEntry` do mês com aquele `cardId`) e a lista de compras do mês (descrição, valor, "X/N", pago). Botão "Lançar compra" (PurchaseDialog) com o cartão pré-selecionado.

---

## Self-Review (feita)
- Cobre a spec: cartões CRUD (T3), parcelamento automático (T4 + installments T2), edição/exclusão de lançamento e parcelamento (T5), fatura-lite (T6), migração aditiva (T1). Domínio testável (installments, validators, entries) em T2.
- Sem quebra: item-based intacto; migração aditiva; `@@unique` mantido.
- Consistência: `installmentMonths`/`purchaseSchema`/`toEntryView` usados como definidos; `CurrencyInput`/`useActionToast`/`Dialog`/`AlertDialog` reutilizados; assinaturas de actions `(prevState, formData)`.
