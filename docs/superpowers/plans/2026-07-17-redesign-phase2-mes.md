# Redesign Fase 2 — Tela do Mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o visual fintech (shadcn) e as interações polidas (dialogs/popovers com `CurrencyInput`, toasts por ação, cards no mobile, empty-state) à tela do Mês (`/mes`), sem alterar as Server Actions nem o domínio.

**Architecture:** As Server Actions (`markPaid`, `upsertEntry`, `copyPreviousMonth`, `applyRange`) e os helpers (`lib/calc`, `lib/money`, `lib/dates`, `groupByCategory`) permanecem intactos. Reescrevemos a apresentação/interação: `page.tsx` reskin com `Card`/`Badge`, KPI `StatCard`s, seções por categoria; os client components passam a usar shadcn (`Dialog`/`Popover`/`Select`/`Button`) + `CurrencyInput` + toasts (Sonner via um hook `useActionToast`).

**Tech Stack:** Next 16, React 19, TS, Tailwind v4, shadcn/ui (já instalado: card, badge, dialog, sheet, select, button, input, label, skeleton…), sonner (Toaster já montado no root), `CurrencyInput` (Fase 1), lucide-react.

## Global Constraints

- **Sem mudanças de domínio/dados/Server Actions.** Não editar `prisma/`, `lib/{calc,money,dates,validators,entries}`, `app/(app)/mes/actions.ts` (só consumir). Se precisar adicionar um `popover` shadcn, use `npx shadcn@latest add popover`.
- **Dinheiro:** exibição via `formatCents` (pt-BR); inputs de valor via `CurrencyInput` (submete reais, casa com `z.coerce.number`). `tabular-nums` em colunas de dinheiro.
- **Toasts:** toda ação (pagar, desmarcar, editar previsto, adicionar, aplicar em lote, copiar mês) mostra toast de sucesso/erro via `useActionToast`.
- **Responsivo:** funciona em mobile e desktop (linhas viram cards no mobile).
- **Acessibilidade:** componentes shadcn/Radix; Dialogs com título/descrição.
- **Verificação por task:** `npx tsc --noEmit` + `npm run build` + `npm test` (31) verdes. Fluxo logado é teste manual (adiado).
- **Commits:** um por task; terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Estado atual (referência)

- `app/(app)/mes/page.tsx` (server): monta `DisplayRow[]` (`entryId,itemId,dueDay,paidDate` + `EntryView`), `groupByCategory`, KPIs via `plannedIncome/Expense/Balance/remainingToPay`, seções com tabela, empty-state, e renderiza `PayCell`/`PlannedCell`/`AddEntryForm`/`BulkApplyForm`. `availableItems` (ativos sem lançamento no mês) e `allActiveItems` já calculados.
- Client components (assinaturas atuais a preservar):
  - `PayCell({ entryId, plannedCents, paid, paidCents, paidDate })`
  - `PlannedCell({ itemId, month, plannedCents })`
  - `AddEntryForm({ month, availableItems })`
  - `BulkApplyForm({ items, defaultMonth })`
- Actions (assinatura `(prevState: ActionState, formData) => Promise<ActionState>`, `ActionState = { error?; ok?; count? }`): `markPaid`, `upsertEntry`, `copyPreviousMonth` (esta é `(month)=>` sem prevState — ver actions.ts), `applyRange`.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `hooks/use-action-toast.ts` | dispara toast (sucesso/erro) a partir do `state` do `useActionState` |
| `components/StatCard.tsx` | card de KPI (label, valor, cor semântica opcional) |
| `app/(app)/mes/page.tsx` | reskin: header + MonthNav, KPIs (StatCard), seções (Card+Badge), empty-state, mobile |
| `app/(app)/mes/CopyPreviousMonthButton.tsx` | client: botão "copiar mês anterior" com toast |
| `app/(app)/mes/PayCell.tsx` | reskin: Popover com CurrencyInput+data / estado pago + Desmarcar; toast |
| `app/(app)/mes/PlannedCell.tsx` | reskin: edição inline com CurrencyInput; toast |
| `app/(app)/mes/AddEntryForm.tsx` | reskin: Dialog (Select com placeholder + CurrencyInput); toast |
| `app/(app)/mes/BulkApplyForm.tsx` | reskin: Dialog (Select + meses + CurrencyInput); toast |

---

## Task 1: `useActionToast` + `StatCard` + reskin do page (shell/KPIs/seções/empty) + copiar-mês com toast

**Files:**
- Create: `hooks/use-action-toast.ts`, `components/StatCard.tsx`, `app/(app)/mes/CopyPreviousMonthButton.tsx`
- Modify: `app/(app)/mes/page.tsx`

**Interfaces:**
- Produces: `useActionToast(state, { success })`; `<StatCard label value tone? />`; `<CopyPreviousMonthButton month />`.
- Consumes: shadcn `card`, `badge`, `button`; `toast` de `sonner`; `copyPreviousMonth` de `./actions`.

- [ ] **Step 1: `hooks/use-action-toast.ts`**

```ts
"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

type State = { error?: string; ok?: boolean; count?: number };

export function useActionToast(state: State, opts: { success: string | ((s: State) => string) }) {
  const seen = useRef<State>(state);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state?.error) toast.error(state.error);
    else if (state?.ok) toast.success(typeof opts.success === "function" ? opts.success(state) : opts.success);
  }, [state, opts]);
}
```

- [ ] **Step 2: `components/StatCard.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  income: "text-emerald-600 dark:text-emerald-400",
  expense: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
} as const;

export function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: keyof typeof TONES }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("text-xl font-semibold tabular-nums", TONES[tone])}>{value}</div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `app/(app)/mes/CopyPreviousMonthButton.tsx` (client, toast)**

```tsx
"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { copyPreviousMonthAction, type ActionState } from "./actions";
import { useActionToast } from "@/hooks/use-action-toast";

export function CopyPreviousMonthButton({ month }: { month: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(copyPreviousMonthAction, {});
  useActionToast(state, { success: (s) => `Copiado do mês anterior (${s.count ?? 0}).` });
  return (
    <form action={formAction}>
      <input type="hidden" name="month" value={month} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>Copiar mês anterior</Button>
    </form>
  );
}
```
> NOTA: `copyPreviousMonth` hoje tem assinatura `(month: string)`. Para usar com `useActionState`, adicione em `actions.ts` um wrapper `copyPreviousMonthAction(prevState: ActionState, formData: FormData): Promise<ActionState>` que lê `month` do formData e chama a lógica existente (NÃO altere a lógica; só um adaptador de assinatura). Este é o único ajuste permitido em `actions.ts` nesta task.

- [ ] **Step 4: Reskin `app/(app)/mes/page.tsx`**

Manter toda a lógica server (queries, `DisplayRow`, `groupByCategory`, `availableItems`, `allActiveItems`). Trocar a apresentação:
- Header: título + `<MonthNav .../>` + `<CopyPreviousMonthButton month={month} />`.
- KPIs: grid `grid-cols-2 md:grid-cols-4 gap-3` com `<StatCard>` (Receitas=income, Despesas=expense, Saldo=default, Falta pagar=warn).
- Seções por categoria: usar shadcn `Card` — `CardHeader` com nome + `<Badge variant={g.categoryType==="INCOME"?"default":"secondary"}>Receita/Despesa</Badge>` + subtotal (`tabular-nums`); `CardContent` com a tabela (desktop) — manter `PlannedCell`/`PayCell` nas colunas Previsto/Pago (serão upgradados nas Tasks 2–3).
- Empty-state: `Card` centralizado com ícone (lucide) + texto + `<CopyPreviousMonthButton>`.
- Manter as seções "Adicionar lançamento" e "Aplicar em lote" (renderizam `AddEntryForm`/`BulkApplyForm`, upgradados na Task 3).
- Responsivo: por ora a tabela pode rolar horizontalmente no mobile (`overflow-x-auto`); cards no mobile vêm na Task 4.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31). Confirmar que a página compila com os componentes existentes dentro do novo shell.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat(mes): reskin shadcn (StatCards, seções em Card/Badge, empty-state) + toast hook + copiar-mês com toast" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PayCell com Popover + CurrencyInput + toast

**Files:**
- Modify: `app/(app)/mes/PayCell.tsx`
- Maybe: `npx shadcn@latest add popover` (se ainda não existir)

**Interfaces:** preservar a assinatura `PayCell({ entryId, plannedCents, paid, paidCents, paidDate })`.

- [ ] **Step 1: garantir o componente Popover** — se `components/ui/popover.tsx` não existir: `npx shadcn@latest add popover -y`.

- [ ] **Step 2: Reescrever `PayCell.tsx`**
- Usa `useActionState(markPaid, {})` + `useActionToast(state, { success: "Pagamento atualizado." })`.
- **Não pago:** um `Button size="sm"` "Pagar" que abre um `Popover`; dentro, um `<form action={formAction}>` com `<input hidden name=entryId>`, `<input hidden name=paid value="true">`, `<CurrencyInput name="paidAmount" defaultCents={plannedCents} />` (valor, default = previsto), `<Input type="date" name="paidDate" defaultValue={hoje}>`, e `Button` "Confirmar" (disabled quando `pending`). Fechar o popover no sucesso (controlar `open` e fechar quando `state.ok` mudar).
- **Pago:** mostrar `formatCents(paidCents)` + data (badge/textinho) + `Button variant="ghost" size="sm"` "Desmarcar" num `<form action={formAction}>` com `paid=false`.
- Datas: manter os helpers `todayISO`/`toDateInputValue` existentes.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31).

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(mes): PayCell com Popover, CurrencyInput e toast" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: PlannedCell inline + AddEntryForm/BulkApplyForm em Dialog (CurrencyInput + Select + toast)

**Files:**
- Modify: `app/(app)/mes/PlannedCell.tsx`, `AddEntryForm.tsx`, `BulkApplyForm.tsx`

**Interfaces:** preservar assinaturas atuais dos três componentes.

- [ ] **Step 1: `PlannedCell.tsx`** — edição inline com `CurrencyInput`:
- Usa `useActionState(upsertEntry, {})` + `useActionToast(state, { success: "Previsto atualizado." })`.
- Um `Button variant="ghost"` mostrando `formatCents(plannedCents)`; ao clicar, revela um `<form action={formAction}>` inline (ou Popover) com `<input hidden name=itemId>`, `<input hidden name=month>`, `<CurrencyInput name="plannedAmount" defaultCents={plannedCents} />` e `Button` "Salvar". Fechar ao sucesso.

- [ ] **Step 2: `AddEntryForm.tsx`** — `Dialog`:
- `Button` "Adicionar lançamento" abre `Dialog` (com `DialogTitle`/`DialogDescription`).
- `<form action={formAction}>` com shadcn `Select name="itemId"` (com opção placeholder `— selecione —`, `required`), `<CurrencyInput name="plannedAmount" />`, `Button` "Adicionar".
- `useActionState(upsertEntry, {})` + `useActionToast(state, { success: "Lançamento adicionado." })`. Fechar o Dialog e resetar ao sucesso.
- Se `availableItems` estiver vazio, mostrar estado "todos os itens já têm lançamento neste mês".

- [ ] **Step 3: `BulkApplyForm.tsx`** — `Dialog`:
- `Button` "Aplicar em lote" abre `Dialog`.
- `<form action={formAction}>` com `Select name="itemId"` (placeholder, required), `<Input type="month" name="from">`, `<Input type="month" name="to">`, `<CurrencyInput name="amount" />`, `Button` "Aplicar".
- `useActionState(applyRange, {})` + `useActionToast(state, { success: (s) => `Aplicado em ${s.count ?? 0} meses.` })`. Fechar/toast ao sucesso.

- [ ] **Step 4: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(mes): editar previsto inline + adicionar/lote em Dialog (CurrencyInput, Select, toast)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Responsivo (linhas como cards no mobile) + polish final

**Files:**
- Modify: `app/(app)/mes/page.tsx` (renderização das linhas)

- [ ] **Step 1: Linhas responsivas** — dentro de cada seção (`Card`), renderizar:
- **Desktop (`hidden md:table`):** a tabela atual (Item / Dia venc / Previsto / Pago).
- **Mobile (`md:hidden`):** cada lançamento como um mini-card empilhado (nome + dia venc em cima; `PlannedCell` e `PayCell` embaixo), com boa área de toque.
- Extrair um pequeno componente de linha, se ajudar, mas manter `PlannedCell`/`PayCell` como estão (Tasks 2–3).

- [ ] **Step 2: Polish** — espaçamentos, `tabular-nums` nos valores, `text-muted-foreground` nos rótulos, ícones lucide onde fizer sentido (ex.: no empty-state e nos botões). Garantir contraste em claro/escuro.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31).

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(mes): linhas como cards no mobile + polish responsivo" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (feita)

- **Cobertura da spec (tela do Mês):** seções por categoria + subtotais (T1), KPIs em cards (T1), empty-state (T1), pagar com valor+data via popover/CurrencyInput + toast (T2), editar previsto (T3), adicionar/lote em Dialog com Select+placeholder+CurrencyInput+toast (T3), toasts em toda ação (T1–T3), cards no mobile (T4). ✔
- **Sem mudança de domínio:** as Server Actions não mudam, exceto um ADAPTADOR de assinatura para `copyPreviousMonth` (`copyPreviousMonthAction(prevState, formData)`) — necessário para `useActionState`; a lógica interna é reaproveitada. Explicitado na Task 1.
- **Placeholders:** nenhum "TBD"; hook/StatCard têm código completo; UI descrita com componentes e props concretos.
- **Consistência:** `useActionToast(state,{success})` consumido igual em todos os client components; `CurrencyInput` (Fase 1) reutilizado (submete reais, casa com Zod); assinaturas dos 4 componentes preservadas para o `page.tsx` continuar passando as mesmas props.
