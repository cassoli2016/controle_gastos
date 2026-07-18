# Redesign Fase 4 — Itens & Categorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o visual fintech (shadcn) às telas de Itens e Categorias: tabelas/cards, criar/editar em Dialog, excluir/arquivar com AlertDialog de confirmação, toasts em toda ação — sem mudar domínio/dados.

**Architecture:** As Server Actions (`createCategory/updateCategory/deleteCategory`, `createItem/updateItem/archiveItem`, todas já `(prevState, formData) => ActionState`) e o domínio ficam intactos. Reescrevemos apresentação/interação dos client components reutilizando shadcn (`Dialog`, `AlertDialog`, `Table`, `Badge`, `Select`, `Input`, `Button`, `Switch`) + `useActionToast` (Fase 2).

**Tech Stack:** Next 16, React 19, TS, Tailwind v4, shadcn/ui (dialog, alert-dialog, table, badge, select, input, switch, button — já instalados), sonner, lucide-react.

## Global Constraints

- **Sem mudança de domínio/dados/Server Actions.** Não editar `prisma/`, `lib/**`, nem os `actions.ts` (só consumir; assinaturas atuais são `(prevState, formData) => { error?, ok? }`).
- **Preservar as assinaturas dos client components** para as `page.tsx` continuarem passando as mesmas props: `NewCategoryForm()`, `CategoryRow({ category })`, `NewItemForm({ categories })`, `ItemRow({ item, categories })` (conferir props reais no arquivo antes de mexer).
- **Toasts** (Sonner via `useActionToast`) em toda ação (criar/editar/excluir/arquivar), incluindo o erro "categoria em uso".
- **Confirmação** (AlertDialog) para excluir categoria e para arquivar/excluir item.
- **Responsivo:** Table no desktop, cards no mobile. `Category.type` com `Badge` (Receita/Despesa) + chip de cor.
- **Item edit envia `active` explícito** (não recair no bug de arquivamento).
- **Verificação por task:** `npx tsc --noEmit` + `npm run build` + `npm test` (31) + `npm run lint` verdes.
- **Commits:** um por task; terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Estado atual (referência — CONFERIR no código antes de editar)

- `categorias/`: `page.tsx` (server, lista + renderiza `NewCategoryForm`/`CategoryRow`), `NewCategoryForm()` (client, useActionState, erro inline), `CategoryRow({category})` (client, edição inline + excluir), `actions.ts`.
- `itens/`: `page.tsx` (server), `NewItemForm({categories})` (client), `ItemRow({item, categories})` (client, edição inline + arquivar/reativar), `actions.ts`.
- Reutilizáveis: `@/hooks/use-action-toast`, `@/components/ui/{dialog,alert-dialog,table,badge,select,input,switch,button,label}`.

---

## Task 1: Categorias — Table/cards + Dialog (criar/editar) + AlertDialog (excluir) + toasts

**Files:** Modify `app/(app)/categorias/page.tsx`, `NewCategoryForm.tsx`, `CategoryRow.tsx`.

- [ ] **Step 1:** Ler os 3 arquivos atuais + `categorias/actions.ts` para as assinaturas/campos exatos.
- [ ] **Step 2: `page.tsx`** — header "Categorias" + `<NewCategoryForm />` (agora um botão "Nova categoria" que abre Dialog). Lista num `Card` com `Table` shadcn no desktop (colunas: cor+nome, tipo (Badge), ações) e cards empilhados no mobile (`md:hidden`). Renderizar um `CategoryRow` por categoria.
- [ ] **Step 3: `NewCategoryForm.tsx`** (client) — `Button` "Nova categoria" abre `Dialog` (DialogTitle/Description). `<form action={formAction}>` com `Input name="name"`, `Select name="type"` (Despesa/Receita), `Input type="color" name="color"`, `Button` "Criar". `useActionState(createCategory,{})` + `useActionToast(state,{success:"Categoria criada."})`. Fecha ao sucesso.
- [ ] **Step 4: `CategoryRow.tsx`** (client) — exibe cor (chip) + nome + `Badge` (Receita/Despesa). Ações: **Editar** (abre `Dialog` com form de `updateCategory` — hidden `id`, name/type/color; toast "Categoria atualizada."; fecha ao sucesso) e **Excluir** (`AlertDialog` de confirmação → `<form action={deleteCategory-formAction>>` com hidden `id`; toast — se erro "em uso", `useActionToast` mostra `state.error`). Preservar assinatura `CategoryRow({ category })`.
- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31), `npm run lint`.
- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat(categorias): Table/cards + Dialog criar/editar + AlertDialog excluir + toasts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Itens — Table/cards + Dialog (criar/editar) + arquivar/reativar + toasts

**Files:** Modify `app/(app)/itens/page.tsx`, `NewItemForm.tsx`, `ItemRow.tsx`.

- [ ] **Step 1:** Ler os 3 arquivos atuais + `itens/actions.ts` para assinaturas/campos exatos.
- [ ] **Step 2: `page.tsx`** — header "Itens" + `<NewItemForm categories={...} />` (botão "Novo item" que abre Dialog). Lista num `Card` com `Table` no desktop (Item, Categoria (Badge), Dia venc, Status ativo/arquivado, ações) e cards no mobile.
- [ ] **Step 3: `NewItemForm.tsx`** (client) — `Button` "Novo item" abre `Dialog`. `<form action={formAction}>` com `Input name="name"`, `Select name="categoryId"` (placeholder + required), `Input type="number" min=1 max=31 name="dueDay"` (opcional), e um hidden `active="true"` (novos nascem ativos). `useActionState(createItem,{})` + `useActionToast(state,{success:"Item criado."})`. Fecha ao sucesso.
- [ ] **Step 4: `ItemRow.tsx`** (client) — linha/card com nome, categoria (Badge), dia venc, status. Ações: **Editar** (`Dialog` com `updateItem` — hidden `id`, name/categoryId/dueDay + **`Switch`/checkbox `active` enviado explícito**; toast "Item atualizado."; fecha ao sucesso) e **Arquivar/Reativar** (`archiveItem`; para arquivar, `AlertDialog` de confirmação; toast). Preservar assinatura `ItemRow({ item, categories })`.
- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31), `npm run lint`.
- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat(itens): Table/cards + Dialog criar/editar + arquivar (AlertDialog) + toasts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (feita)

- **Cobertura da spec (Itens & Categorias):** tabelas/cards ✔, criar/editar em Dialog ✔, excluir/arquivar com AlertDialog ✔, erro "em uso" via toast ✔, item edit com `active` explícito ✔, Badge tipo + chip de cor ✔, responsivo ✔.
- **Sem mudança de domínio:** só apresentação/interação; assinaturas dos client components e das actions preservadas.
- **Placeholders:** nenhum "TBD"; cada task tem requisitos concretos (Dialog/AlertDialog/Table/toast) e manda conferir o código atual no Step 1 (evita assumir campos errados).
- **Consistência:** `useActionToast` reutilizado; shadcn `Dialog`/`AlertDialog`/`Table` já instalados; padrão de fechar-no-sucesso igual ao das Fases 2–3.
