# Depósito e pagamento pela caixinha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão **Depositar** na caixinha (vira despesa paga no mês) e seletor **"De onde sai o dinheiro?"** na baixa de contas (paga pela caixinha gera retirada compensando no mês) — para o dinheiro contar uma vez só em todas as telas.

**Architecture:** Depósito e retirada são `MonthlyEntry` comuns (despesa/receita já pagos) criados na mesma `prisma.$transaction` que ajusta o `ReserveBox.amount`. A montagem dos dados fica em helpers puros (`lib/reserve-flow.ts`), testáveis sem banco. Nenhuma tela de soma muda — os lançamentos entram nos totais existentes. Spec: `docs/superpowers/specs/2026-07-31-deposito-caixinha-design.md`.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma (PostgreSQL), Zod, shadcn/ui, Vitest.

## Global Constraints

- **Dinheiro:** formulários mandam REAIS decimais (`CurrencyInput`); o banco guarda `Decimal(12,2)` em reais; exibição/comparação em centavos via `decimalToCents`/`formatCents` (`lib/money.ts`).
- **Datas:** sempre UTC com sufixo `T00:00:00Z`; competência = 1º dia do mês UTC (`monthToDate` de `lib/dates.ts`).
- **Categorias de caixinha (nomes/cores exatos):** `Reserva` (EXPENSE, `#14b8a6`) e `Retirada da reserva` (INCOME, `#14b8a6`).
- **Descrições exatas dos lançamentos:** `Depósito · <nome da caixinha>` e `Retirada · <nome da caixinha>` (separador ` · `, U+00B7).
- **Textos de UI em pt-BR** com acentuação correta.
- **Este repo usa uma versão de Next.js com breaking changes** — antes de mexer em páginas/actions, leia o guia relevante em `node_modules/next/dist/docs/` (AGENTS.md).
- **Commits:** mensagem em pt-BR estilo conventional (`feat: …`). O working tree tem um `D app/icon.png` alheio a este trabalho — **sempre `git add` só os arquivos da task**, nunca `git add -A`.
- Server Actions não têm harness de teste com banco neste projeto — a convenção é testar helpers puros com Vitest e validar actions pelo app (Task 6).

---

### Task 1: Helpers puros `lib/reserve-flow.ts`

**Files:**
- Create: `lib/reserve-flow.ts`
- Test: `tests/reserve-flow.test.ts`

**Interfaces:**
- Consumes: `monthToDate(month: string): Date` de `@/lib/dates`.
- Produces (usado nas Tasks 2 e 4):
  - `RESERVE_CATEGORY = { name: "Reserva", type: "EXPENSE", color: "#14b8a6" }`
  - `RESERVE_WITHDRAWAL_CATEGORY = { name: "Retirada da reserva", type: "INCOME", color: "#14b8a6" }`
  - `depositEntryData(reserveName: string, amount: number, dateISO: string): ReserveEntryData`
  - `withdrawalEntryData(reserveName: string, amount: number, entryMonth: Date, paidDateISO: string): ReserveEntryData`
  - `ReserveEntryData = { description: string; month: Date; purchaseDate: Date; plannedAmount: number; paid: true; paidAmount: number; paidDate: Date }`

- [ ] **Step 1: Write the failing test**

Crie `tests/reserve-flow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  depositEntryData,
  withdrawalEntryData,
  RESERVE_CATEGORY,
  RESERVE_WITHDRAWAL_CATEGORY,
} from "@/lib/reserve-flow";

describe("depositEntryData", () => {
  it("competência = mês da data; lançamento já pago com o mesmo valor", () => {
    expect(depositEntryData("Emergência", 1500.5, "2026-07-31")).toEqual({
      description: "Depósito · Emergência",
      month: new Date(Date.UTC(2026, 6, 1)),
      purchaseDate: new Date("2026-07-31T00:00:00Z"),
      plannedAmount: 1500.5,
      paid: true,
      paidAmount: 1500.5,
      paidDate: new Date("2026-07-31T00:00:00Z"),
    });
  });
  it("virada de ano deriva a competência certa", () => {
    expect(depositEntryData("Emergência", 10, "2026-12-31").month).toEqual(new Date(Date.UTC(2026, 11, 1)));
    expect(depositEntryData("Emergência", 10, "2027-01-01").month).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });
});

describe("withdrawalEntryData", () => {
  it("competência = mês da CONTA paga, não o mês da data do pagamento", () => {
    const julho = new Date(Date.UTC(2026, 6, 1));
    expect(withdrawalEntryData("Emergência", 500, julho, "2026-08-02")).toEqual({
      description: "Retirada · Emergência",
      month: julho,
      purchaseDate: new Date("2026-08-02T00:00:00Z"),
      plannedAmount: 500,
      paid: true,
      paidAmount: 500,
      paidDate: new Date("2026-08-02T00:00:00Z"),
    });
  });
});

describe("categorias dos movimentos", () => {
  it("nomes e tipos distintos, mesma cor", () => {
    expect(RESERVE_CATEGORY).toEqual({ name: "Reserva", type: "EXPENSE", color: "#14b8a6" });
    expect(RESERVE_WITHDRAWAL_CATEGORY).toEqual({
      name: "Retirada da reserva",
      type: "INCOME",
      color: "#14b8a6",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/reserve-flow.test.ts`
Expected: FAIL — `Cannot find module '@/lib/reserve-flow'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

Crie `lib/reserve-flow.ts`:

```ts
import { monthToDate } from "@/lib/dates";

/**
 * Movimentos de caixinha viram MonthlyEntry comuns (já pagos) criados na
 * mesma transação que ajusta ReserveBox.amount — assim o dinheiro está OU no
 * mês OU na caixinha, nunca nos dois (spec 2026-07-31-deposito-caixinha).
 */
export const RESERVE_CATEGORY = { name: "Reserva", type: "EXPENSE", color: "#14b8a6" } as const;
export const RESERVE_WITHDRAWAL_CATEGORY = {
  name: "Retirada da reserva",
  type: "INCOME",
  color: "#14b8a6",
} as const;

export type ReserveEntryData = {
  description: string;
  month: Date;
  purchaseDate: Date;
  /** Reais (convenção dos forms e do Decimal no banco). */
  plannedAmount: number;
  paid: true;
  paidAmount: number;
  paidDate: Date;
};

/** Lançamento de um depósito: competência = mês da data, já pago. */
export function depositEntryData(reserveName: string, amount: number, dateISO: string): ReserveEntryData {
  const date = new Date(dateISO + "T00:00:00Z");
  return {
    description: `Depósito · ${reserveName}`,
    month: monthToDate(dateISO.slice(0, 7)),
    purchaseDate: date,
    plannedAmount: amount,
    paid: true,
    paidAmount: amount,
    paidDate: date,
  };
}

/**
 * Lançamento da retirada ao pagar uma conta pela caixinha: competência = mês
 * da CONTA (o par despesa/retirada se cancela no mesmo mês).
 */
export function withdrawalEntryData(
  reserveName: string,
  amount: number,
  entryMonth: Date,
  paidDateISO: string,
): ReserveEntryData {
  const date = new Date(paidDateISO + "T00:00:00Z");
  return {
    description: `Retirada · ${reserveName}`,
    month: entryMonth,
    purchaseDate: date,
    plannedAmount: amount,
    paid: true,
    paidAmount: amount,
    paidDate: date,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/reserve-flow.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/reserve-flow.ts tests/reserve-flow.test.ts
git commit -m "feat: helpers puros dos movimentos de caixinha"
```

---

### Task 2: Action `depositToReserve`

**Files:**
- Modify: `lib/validators.ts` (fim do arquivo, após `dailyBudgetSchema`)
- Modify: `lib/purchases.ts` (após `resolveIncomeCategoryId`, ~linha 33)
- Modify: `app/(app)/reservas/actions.ts`

**Interfaces:**
- Consumes: `RESERVE_CATEGORY`, `depositEntryData` (Task 1); `guardAction`, `revalidateFinance`, `prisma` (já importados em `reservas/actions.ts`).
- Produces (usado na Task 3): Server Action `depositToReserve(_prevState: ActionState, formData: FormData): Promise<ActionState>` lendo os campos `id`, `amount`, `date` do FormData. Também `resolveCategoryId(spec): Promise<string>` em `@/lib/purchases` (usado na Task 4).

- [ ] **Step 1: Schema `depositSchema` em `lib/validators.ts`**

Acrescente ao fim do arquivo:

```ts
/** Depósito numa caixinha: vira lançamento de despesa já pago no mês da data. */
export const depositSchema = z.object({
  id: z.string().min(1, "Caixinha inválida"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data YYYY-MM-DD"),
});
```

- [ ] **Step 2: `resolveCategoryId` genérico em `lib/purchases.ts`**

Acrescente após `resolveIncomeCategoryId` (mesmo padrão find-or-create dos vizinhos):

```ts
/** Find-or-create de categoria por nome (categorias de sistema, ex.: movimentos de caixinha). */
export async function resolveCategoryId(spec: {
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { name: spec.name } });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: spec });
  return created.id;
}
```

- [ ] **Step 3: Action em `app/(app)/reservas/actions.ts`**

Acrescente aos imports do arquivo (sem duplicar): `depositSchema` em `@/lib/validators`; e as linhas novas:

```ts
import { resolveCategoryId } from "@/lib/purchases";
import { RESERVE_CATEGORY, depositEntryData } from "@/lib/reserve-flow";
```

Acrescente a action após `deleteReserve`:

```ts
/**
 * Deposita na caixinha: soma no amount E cria o lançamento de despesa já pago
 * no mês da data — numa transação só, para o dinheiro nunca contar duas vezes.
 */
export const depositToReserve = guardAction(async function depositToReserve(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = depositSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, amount, date } = parsed.data;

  const box = await prisma.reserveBox.findUnique({ where: { id } });
  if (!box) return { error: "Caixinha não encontrada." };

  const categoryId = await resolveCategoryId(RESERVE_CATEGORY);
  await prisma.$transaction(async (tx) => {
    await tx.reserveBox.update({ where: { id }, data: { amount: { increment: amount } } });
    await tx.monthlyEntry.create({ data: { categoryId, ...depositEntryData(box.name, amount, date) } });
  });
  revalidateFinance();
  return { ok: true };
});
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts lib/purchases.ts "app/(app)/reservas/actions.ts"
git commit -m "feat: action de depósito na caixinha"
```

---

### Task 3: Botão Depositar no `ReserveCard`

**Files:**
- Modify: `app/(app)/reservas/ReserveCard.tsx`

**Interfaces:**
- Consumes: `depositToReserve` (Task 2), componentes já importados no arquivo (`Dialog`, `CurrencyInput`, `Input`, `Label`, `Button`) e o hook `useActionToast`.
- Produces: UI final do depósito — nada consome depois.

- [ ] **Step 1: Adicionar o diálogo de depósito**

Em `app/(app)/reservas/ReserveCard.tsx`:

1. No import de `./actions`, acrescente `depositToReserve`. No import do lucide, acrescente `Plus`.
2. Adicione o helper de data no topo do arquivo (mesmo padrão do `PayCell`):

```ts
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
```

3. Dentro do componente, ao lado dos estados existentes, acrescente:

```ts
const [depositState, depositAction, depositPending] = useActionState<ActionState, FormData>(depositToReserve, {});
useActionToast(depositState, { success: "Depósito registrado." });
const [depositOpen, setDepositOpen] = useState(false);
const [seenDeposit, setSeenDeposit] = useState(depositState);
if (depositState !== seenDeposit) {
  setSeenDeposit(depositState);
  if (depositState.ok) setDepositOpen(false);
}
```

4. No JSX, dentro do `div` de ações (antes do `Dialog` de editar), acrescente o diálogo — o botão usa ícone `Plus` para não repetir o cofrinho do card:

```tsx
<Dialog open={depositOpen} onOpenChange={setDepositOpen}>
  <DialogTrigger asChild>
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Depositar em ${reserve.name}`}>
      <Plus className="size-4" />
    </Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Depositar em “{reserve.name}”</DialogTitle>
      <DialogDescription>
        O valor soma na caixinha e entra como despesa paga (“Reserva”) no mês da data — assim o
        dinheiro não conta duas vezes.
      </DialogDescription>
    </DialogHeader>
    <form action={depositAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={reserve.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reserve-deposit-amount-${reserve.id}`}>Valor</Label>
        <CurrencyInput id={`reserve-deposit-amount-${reserve.id}`} name="amount" defaultCents={0} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reserve-deposit-date-${reserve.id}`}>Data</Label>
        <Input
          id={`reserve-deposit-date-${reserve.id}`}
          type="date"
          name="date"
          defaultValue={todayISO()}
          required
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={depositPending}>
          Depositar
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/reservas/ReserveCard.tsx"
git commit -m "feat: botão Depositar na caixinha"
```

---

### Task 4: `markPaid` com origem na caixinha

**Files:**
- Modify: `lib/validators.ts:37-42` (`markPaidSchema`)
- Modify: `app/(app)/mes/actions.ts:62-81` (`markPaid`)

**Interfaces:**
- Consumes: `RESERVE_WITHDRAWAL_CATEGORY`, `withdrawalEntryData` (Task 1); `resolveCategoryId` (Task 2); `decimalToCents` de `@/lib/money`.
- Produces (usado na Task 5): `markPaid` passa a ler o campo opcional `reserveId` do FormData — ausente ou `"none"` significa "dinheiro do mês" (comportamento idêntico ao atual).

- [ ] **Step 1: `markPaidSchema` ganha `reserveId`**

Em `lib/validators.ts`, substitua o `markPaidSchema` por:

```ts
export const markPaidSchema = z.object({
  entryId: z.string().min(1),
  paid: z.boolean(),
  paidAmount: z.coerce.number().nonnegative().nullable().optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  // Caixinha de onde sai o dinheiro (null = dinheiro do mês).
  reserveId: z.string().min(1).nullable().optional(),
});
```

- [ ] **Step 2: Reescrever `markPaid` em `app/(app)/mes/actions.ts`**

Acrescente aos imports do arquivo (sem duplicar): `decimalToCents` de `@/lib/money`, `resolveCategoryId` de `@/lib/purchases`, e:

```ts
import { RESERVE_WITHDRAWAL_CATEGORY, withdrawalEntryData } from "@/lib/reserve-flow";
```

Substitua a função `markPaid` inteira por:

```ts
export const markPaid = guardAction(async function markPaid(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const rawReserve = formData.get("reserveId");
  const parsed = markPaidSchema.safeParse({
    entryId: formData.get("entryId"),
    paid: formData.get("paid") === "true",
    paidAmount: formData.get("paidAmount") || null,
    paidDate: formData.get("paidDate") || null,
    reserveId: rawReserve && rawReserve !== "none" ? rawReserve : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { entryId, paid, paidAmount, paidDate, reserveId } = parsed.data;
  const data = {
    paid,
    paidAmount: paid ? paidAmount ?? undefined : null,
    paidDate: paid && paidDate ? new Date(paidDate + "T00:00:00Z") : null,
  };

  if (!paid || !reserveId) {
    await prisma.monthlyEntry.update({ where: { id: entryId }, data });
    revalidateFinance();
    return { ok: true };
  }

  // Pagando pela caixinha: além da baixa, o valor sai da caixinha e uma
  // retirada (receita já recebida) compensa no mês da conta — sem ela a
  // despesa descontaria o patrimônio duas vezes (saldo do mês + caixinha).
  if (paidAmount == null) return { error: "Informe o valor pago." };
  if (!paidDate) return { error: "Informe a data do pagamento." };
  const box = await prisma.reserveBox.findUnique({ where: { id: reserveId } });
  if (!box) return { error: "Caixinha não encontrada." };
  if (decimalToCents(String(box.amount)) < Math.round(paidAmount * 100))
    return { error: "Saldo insuficiente na caixinha." };

  const categoryId = await resolveCategoryId(RESERVE_WITHDRAWAL_CATEGORY);
  await prisma.$transaction(async (tx) => {
    const entry = await tx.monthlyEntry.update({ where: { id: entryId }, data });
    await tx.reserveBox.update({ where: { id: reserveId }, data: { amount: { decrement: paidAmount } } });
    await tx.monthlyEntry.create({
      data: { categoryId, ...withdrawalEntryData(box.name, paidAmount, entry.month, paidDate) },
    });
  });
  revalidateFinance();
  return { ok: true };
});
```

- [ ] **Step 3: Rodar os testes e tipos**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, sem erros de tipo/lint novos.

- [ ] **Step 4: Commit**

```bash
git add lib/validators.ts "app/(app)/mes/actions.ts"
git commit -m "feat: pagar conta com dinheiro da caixinha na baixa"
```

---

### Task 5: Seletor "De onde sai o dinheiro?" no `PayCell`

**Files:**
- Modify: `app/(app)/mes/PayCell.tsx`
- Modify: `app/(app)/mes/page.tsx` (busca das caixinhas + repasse nos dois call sites de `EntryRow`, ~linhas 358 e 367)

**Interfaces:**
- Consumes: `markPaid` com `reserveId` (Task 4); `getReserves(): Promise<ReserveView[]>` de `@/lib/planning` (`ReserveView = { id, name, amountCents }`); `Select/SelectContent/SelectItem/SelectTrigger/SelectValue` de `@/components/ui/select` (padrão de form como no `PurchaseDialog`, sentinel `"none"`).
- Produces: UI final — nada consome depois.

- [ ] **Step 1: `PayCell` ganha a prop `reserves`**

Em `app/(app)/mes/PayCell.tsx`:

1. Acrescente o import:

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

2. Acrescente a prop ao componente (tipo e destructuring, com default para não quebrar outros usos):

```ts
/** Caixinhas para pagar "pela caixinha" (só faz sentido em despesas). */
reserves?: { id: string; name: string }[];
```

e no destructuring: `reserves = [],`.

3. No formulário do popover de pagar, entre o campo de data e o botão Confirmar, acrescente:

```tsx
{!income && reserves.length > 0 && (
  <div className="flex flex-col gap-1">
    <label htmlFor={`reserveId-${entryId}`} className="text-xs text-muted-foreground">
      De onde sai o dinheiro?
    </label>
    <Select name="reserveId" defaultValue="none">
      <SelectTrigger id={`reserveId-${entryId}`} className="w-full">
        <SelectValue placeholder="Do mês" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Do mês</SelectItem>
        {reserves.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            Caixinha · {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 2: `mes/page.tsx` busca e repassa as caixinhas**

1. Acrescente `getReserves` ao import de `@/lib/planning` (o arquivo já importa `getDailyBudget` de lá).
2. No `Promise.all` do `MesPage`, acrescente `getReserves()` ao final e o nome `reserves` no destructuring:

```ts
const [rows, activeItems, activeCards, categories, budget, reserves] = await Promise.all([
  prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } }, category: true, card: true },
    orderBy: { item: { name: "asc" } },
  }),
  prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  prisma.creditCard.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  prisma.category.findMany({ orderBy: { name: "asc" } }),
  getDailyBudget(),
  getReserves(),
]);
const reserveOptions = reserves.map((r) => ({ id: r.id, name: r.name }));
```

(As cinco primeiras posições são exatamente as que já existem no arquivo — só entra `getReserves()` no fim e `reserves` no destructuring.)

3. `EntryRow` ganha a prop `reserves: { id: string; name: string }[]` (tipo + destructuring) e repassa ao `<PayCell … reserves={reserves} />`.
4. Nos **dois** call sites de `<EntryRow …>` (desktop ~linha 358 e mobile ~linha 367), acrescente `reserves={reserveOptions}`.

- [ ] **Step 3: Verificar tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/mes/PayCell.tsx" "app/(app)/mes/page.tsx"
git commit -m "feat: seletor de origem do dinheiro na baixa do mês"
```

---

### Task 6: Verificação de ponta a ponta

**Files:**
- Nenhum arquivo novo — só verificação.

**Interfaces:**
- Consumes: tudo das Tasks 1-5.

- [ ] **Step 1: Suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde; build sem erros.

- [ ] **Step 2: E2E existente**

Run: `npm run e2e` (usa `e2e:server` na porta 3199 com reset do banco de teste)
Expected: suíte `e2e/app.spec.ts` verde — as telas Mês/Reservas continuam funcionando.

- [ ] **Step 3: Verificação visual no app**

Com `npm run dev` (banco de desenvolvimento):

1. **Reservas:** anotar o "Total guardado". Depositar R$ 100,00 numa caixinha (data de hoje) → caixinha e Total guardado sobem R$ 100,00; toast "Depósito registrado.".
2. **Mês (mês corrente):** existe a linha `Depósito · <caixinha>` na categoria "Reserva", já paga, e o saldo do mês caiu R$ 100,00.
3. **Dashboard:** o Patrimônio projetado do mês corrente **não** mudou com o depósito (caixinha subiu o que o saldo desceu).
4. **Pagar pela caixinha:** numa conta não paga do mês, usar "Pagar" escolhendo a caixinha → conta baixada, caixinha desceu o valor pago, linha `Retirada · <caixinha>` (receita, já recebida) no mês; patrimônio projetado inalterado no ato.
5. **Saldo insuficiente:** tentar pagar pela caixinha um valor maior que o saldo dela → erro "Saldo insuficiente na caixinha." e nada muda.
6. Registrar o resultado (screenshots ou descrição) na resposta final.

- [ ] **Step 4: Reverter os dados de teste do banco de desenvolvimento**

Excluir os lançamentos de teste criados (linhas `Depósito ·`/`Retirada ·` do mês) e corrigir a caixinha pela edição manual, deixando o banco como estava (a baixa de teste também deve ser desmarcada).
