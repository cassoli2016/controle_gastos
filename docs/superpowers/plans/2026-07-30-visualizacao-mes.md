# Melhor Visualização do Mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards do Dashboard e da tela Mês com progresso pago/pendente, saldo honesto sem receita, visibilidade das próximas faturas de cartão e lista de lançamentos com pagos esmaecidos, atrasados destacados e contador por categoria.

**Architecture:** Helpers puros novos em `lib/calc.ts` e `lib/card-entry.ts` (TDD), `StatCard` ganha props opcionais `detail`/`progress`, e um componente compartilhado `MonthStatCards` elimina a duplicação dos 4 cards entre as duas páginas server-side. Nenhuma mudança de schema ou de regime de competência.

**Tech Stack:** Next.js (App Router, server components), Prisma 7 + Postgres (Supabase), Tailwind v4 + shadcn, vitest, Playwright (verificação visual manual).

**Spec:** `docs/superpowers/specs/2026-07-30-visualizacao-mes-design.md`

## Global Constraints

- Dinheiro sempre em **centavos inteiros**; Prisma Decimal → `decimalToCents(String(x))` (`lib/money.ts`).
- "Hoje" sempre via `todayISOInSaoPaulo()` (`lib/fatura.ts`), nunca `new Date()` direto em código de servidor.
- Textos de UI em pt-BR com acentuação correta.
- Este Next.js tem breaking changes vs. conhecimento prévio — em dúvida sobre API do Next, ler `node_modules/next/dist/docs/` (aqui só usamos padrões já presentes nas páginas).
- Testes: vitest, arquivos em `tests/*.test.ts`, alias `@/` = raiz do repo. Rodar com `npm test`.
- Commits: conventional commits com assunto em pt-BR, terminando com:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01XTLnucv4no21kxt76XPnnu`.
- Branch de trabalho: `feat/visualizacao-mes` (já criada, contém o spec).
- A linha derivada "Reserva do dia a dia" NÃO é conta pagável: fica fora de contagens "N contas"/"2/4 pagos".

---

### Task 1: Helpers de progresso e atraso em `lib/calc.ts`

**Files:**
- Modify: `lib/calc.ts`
- Test: `tests/calc.test.ts`

**Interfaces:**
- Consumes: `EntryView`, `sumCents` (já existentes em `lib/calc.ts`/`lib/money.ts`).
- Produces:
  - `paidExpense(e: EntryView[]): number`
  - `receivedIncome(e: EntryView[]): number`
  - `progressPct(paidCents: number, totalCents: number): number` (inteiro 0–100)
  - `isOverdue(row: { paid: boolean; categoryType: "INCOME" | "EXPENSE"; dueDay: number | null }, month: string, todayISO: string): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `tests/calc.test.ts` (a fixture `E` já existe no arquivo: SALÁRIO pago 2.500.000; YOUTUBE pago 6.000; ESTACIONAMENTO e PS PLUS não pagos 22.000/59.000). Acrescentar `paidExpense, receivedIncome, progressPct, isOverdue` ao import de `@/lib/calc` no topo do arquivo.

```ts
describe("progresso de pagamento", () => {
  it("paidExpense soma só despesas pagas", () => expect(paidExpense(E)).toBe(6000));
  it("paidExpense é o complemento de remainingToPay", () =>
    expect(paidExpense(E) + remainingToPay(E)).toBe(plannedExpense(E)));
  it("receivedIncome soma só receitas pagas", () => expect(receivedIncome(E)).toBe(2500000));
  it("progressPct arredonda para inteiro", () => {
    expect(progressPct(6000, 87000)).toBe(7);
    expect(progressPct(66000, 115000)).toBe(57);
  });
  it("progressPct com total 0 → 0 (sem divisão por zero)", () => {
    expect(progressPct(0, 0)).toBe(0);
    expect(progressPct(500, 0)).toBe(0);
  });
  it("progressPct nunca passa de 100", () => expect(progressPct(200, 100)).toBe(100));
});

describe("isOverdue", () => {
  const base = { paid: false, categoryType: "EXPENSE" as const, dueDay: 10 };
  it("mês corrente, vencimento já passou → atrasada", () =>
    expect(isOverdue(base, "2026-07", "2026-07-30")).toBe(true));
  it("mês corrente, vence hoje → não atrasada", () =>
    expect(isOverdue({ ...base, dueDay: 30 }, "2026-07", "2026-07-30")).toBe(false));
  it("mês passado, não paga → atrasada mesmo sem dueDay", () =>
    expect(isOverdue({ ...base, dueDay: null }, "2026-06", "2026-07-30")).toBe(true));
  it("mês futuro nunca atrasa", () =>
    expect(isOverdue(base, "2026-08", "2026-07-30")).toBe(false));
  it("paga não atrasa", () =>
    expect(isOverdue({ ...base, paid: true }, "2026-07", "2026-07-30")).toBe(false));
  it("receita não atrasa", () =>
    expect(isOverdue({ ...base, categoryType: "INCOME" as const }, "2026-07", "2026-07-30")).toBe(false));
  it("mês corrente sem dueDay não atrasa", () =>
    expect(isOverdue({ ...base, dueDay: null }, "2026-07", "2026-07-30")).toBe(false));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/calc.test.ts`
Expected: FAIL — `paidExpense` etc. não exportados.

- [ ] **Step 3: Implementar em `lib/calc.ts`**

Depois de `remainingToPay`:

```ts
/** Soma dos previstos de despesas já pagas (complemento de remainingToPay). */
export function paidExpense(e: EntryView[]): number {
  return sumCents(expense(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/** Soma dos previstos de receitas já recebidas. */
export function receivedIncome(e: EntryView[]): number {
  return sumCents(income(e).filter((x) => x.paid).map((x) => x.plannedCents));
}
/** Percentual inteiro 0–100 (clampado); total <= 0 → 0, sem divisão por zero. */
export function progressPct(paidCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((paidCents / totalCents) * 100)));
}
/**
 * Despesa não paga está atrasada quando o mês já passou, ou quando é o mês
 * corrente e o dia de vencimento ficou para trás. Receita, linha paga e mês
 * futuro nunca atrasam; sem dueDay, só o mês passado conta.
 * "YYYY-MM" compara lexicograficamente na ordem cronológica.
 */
export function isOverdue(
  row: { paid: boolean; categoryType: "INCOME" | "EXPENSE"; dueDay: number | null },
  month: string,
  todayISO: string,
): boolean {
  if (row.paid || row.categoryType === "INCOME") return false;
  const todayMonth = todayISO.slice(0, 7);
  if (month < todayMonth) return true;
  if (month > todayMonth) return false;
  return row.dueDay !== null && row.dueDay < Number(todayISO.slice(8, 10));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/calc.test.ts`
Expected: PASS (suíte inteira do arquivo).

- [ ] **Step 5: Commit**

```bash
git add lib/calc.ts tests/calc.test.ts
git commit -m "feat: helpers de progresso pago/pendente e atraso no calc"
```

---

### Task 2: `upcomingCardCommitments` em `lib/card-entry.ts`

**Files:**
- Modify: `lib/card-entry.ts`
- Test: `tests/card-entry.test.ts`

**Interfaces:**
- Consumes: nada novo (função pura).
- Produces: `upcomingCardCommitments(rows: { month: string; plannedCents: number }[]): { month: string; totalCents: number }[]` — agrupado por mês, somado, ordenado cronologicamente, sem meses de total 0.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `tests/card-entry.test.ts` (e `upcomingCardCommitments` ao import de `@/lib/card-entry`):

```ts
describe("upcomingCardCommitments", () => {
  it("agrupa por mês, soma cartões e ordena", () => {
    expect(
      upcomingCardCommitments([
        { month: "2026-09", plannedCents: 10000 },
        { month: "2026-08", plannedCents: 25000 },
        { month: "2026-08", plannedCents: 10000 },
      ]),
    ).toEqual([
      { month: "2026-08", totalCents: 35000 },
      { month: "2026-09", totalCents: 10000 },
    ]);
  });
  it("mês zerado (antecipação cobre a fatura) fica de fora", () => {
    expect(
      upcomingCardCommitments([
        { month: "2026-08", plannedCents: 5000 },
        { month: "2026-08", plannedCents: -5000 },
      ]),
    ).toEqual([]);
  });
  it("vazio → vazio", () => expect(upcomingCardCommitments([])).toEqual([]));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/card-entry.test.ts`
Expected: FAIL — `upcomingCardCommitments` não exportado.

- [ ] **Step 3: Implementar em `lib/card-entry.ts`**

Logo após `shouldDropZeroedCardEntry`:

```ts
/**
 * Total já comprometido por mês em faturas futuras: agrupa consolidados de
 * cartão por mês, soma todos os cartões, ordena e descarta mês zerado.
 * Visibilidade apenas — a despesa continua contando no mês do vencimento.
 */
export function upcomingCardCommitments(
  rows: { month: string; plannedCents: number }[],
): { month: string; totalCents: number }[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.plannedCents);
  return [...byMonth.entries()]
    .map(([month, totalCents]) => ({ month, totalCents }))
    .filter((x) => x.totalCents !== 0)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/card-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/card-entry.ts tests/card-entry.test.ts
git commit -m "feat: total comprometido por mês nas próximas faturas"
```

---

### Task 3: `StatCard` com detail/progress + componente `MonthStatCards`

**Files:**
- Modify: `components/StatCard.tsx`
- Create: `components/MonthStatCards.tsx`

**Interfaces:**
- Consumes: helpers da Task 1; `DailyBudgetLine` de `lib/daily-budget.ts`; `formatCents`.
- Produces:
  - `StatCard` aceita `detail?: string` e `progress?: number` (0–100), retrocompatível.
  - `MonthStatCards({ views, realViews, budgetLine }: { views: EntryView[]; realViews: EntryView[]; budgetLine: DailyBudgetLine | null })` — a grade dos 4 cards, usada pelas Tasks 4 e 5.

- [ ] **Step 1: Enriquecer `components/StatCard.tsx`**

Adicionar a cor da barra a cada tom e as duas props novas. Arquivo completo resultante:

```tsx
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: {
    value: "text-foreground",
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  income: {
    value: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  expense: {
    value: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
  },
  warn: {
    value: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
} as const;

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  detail,
  progress,
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  /** Sub-linha explicativa abaixo do valor (ex.: "R$ 660,00 pago · R$ 490,00 falta"). */
  detail?: string;
  /** 0–100: barra fina de progresso na cor do tom. Ausente = sem barra. */
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-2.5 p-3 md:gap-3 md:p-4">
        {Icon && (
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg md:size-9", t.chip)}>
            <Icon className="size-4 md:size-4.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {label}
          </div>
          {/* text-base no mobile: "R$ 25.000,00" cabe inteiro num card de meia largura */}
          <div className={cn("truncate text-base font-bold tabular-nums md:text-xl", t.value)}>{value}</div>
          {detail && (
            <div className="truncate text-[11px] text-muted-foreground md:text-xs">{detail}</div>
          )}
          {progress !== undefined && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", t.bar)}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

(Única mudança estrutural fora das props: `min-w-0` → `min-w-0 flex-1`, para a barra ocupar a largura do card.)

- [ ] **Step 2: Criar `components/MonthStatCards.tsx`**

```tsx
import { TrendingUp, TrendingDown, Wallet, Clock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import {
  plannedIncome,
  plannedExpense,
  plannedBalance,
  remainingToPay,
  paidExpense,
  receivedIncome,
  progressPct,
  type EntryView,
} from "@/lib/calc";
import { formatCents } from "@/lib/money";
import type { DailyBudgetLine } from "@/lib/daily-budget";

/**
 * Grade dos 4 cards do mês (Dashboard e tela Mês, sempre iguais).
 * `views` = lançamentos + linha derivada da reserva; `realViews` = só os
 * lançamentos do banco — a contagem "N contas" não inclui a reserva, que não
 * é conta pagável.
 */
export function MonthStatCards({
  views,
  realViews,
  budgetLine,
}: {
  views: EntryView[];
  realViews: EntryView[];
  budgetLine: DailyBudgetLine | null;
}) {
  const incomeTotal = plannedIncome(views);
  const expenseTotal = plannedExpense(views);
  const paidExp = paidExpense(views);
  const remaining = remainingToPay(views);
  const receivedInc = receivedIncome(views);
  const balance = plannedBalance(views);

  const unpaidCount = realViews.filter((v) => v.categoryType === "EXPENSE" && !v.paid).length;
  const contasLabel = `${unpaidCount} ${unpaidCount === 1 ? "conta" : "contas"}`;
  const faltaDetail = budgetLine && budgetLine.cents > 0 ? `${contasLabel} + reserva` : contasLabel;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Receitas"
        value={formatCents(incomeTotal)}
        tone="income"
        icon={TrendingUp}
        detail={
          incomeTotal > 0
            ? `${formatCents(receivedInc)} recebido · ${formatCents(incomeTotal - receivedInc)} a receber`
            : "nenhuma receita lançada"
        }
        progress={incomeTotal > 0 ? progressPct(receivedInc, incomeTotal) : undefined}
      />
      <StatCard
        label="Despesas"
        value={formatCents(expenseTotal)}
        tone="expense"
        icon={TrendingDown}
        detail={`${formatCents(paidExp)} pago · ${formatCents(remaining)} falta`}
        progress={progressPct(paidExp, expenseTotal)}
      />
      {incomeTotal === 0 ? (
        <StatCard label="Saldo" value="—" icon={Wallet} detail="sem receitas lançadas" />
      ) : (
        <StatCard
          label="Saldo"
          value={formatCents(balance)}
          tone={balance < 0 ? "expense" : "default"}
          icon={Wallet}
        />
      )}
      <StatCard
        label="Falta pagar"
        value={formatCents(remaining)}
        tone="warn"
        icon={Clock}
        detail={faltaDetail}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verificar que nada quebrou**

Run: `npm test && npm run lint`
Expected: suíte PASS; lint sem erros novos (o componente novo ainda não é usado — se o lint reclamar de unused, é aceitável ignorar até a Task 4; NÃO adicionar eslint-disable).

- [ ] **Step 4: Commit**

```bash
git add components/StatCard.tsx components/MonthStatCards.tsx
git commit -m "feat: StatCard com detalhe/progresso e grade MonthStatCards"
```

---

### Task 4: Dashboard — cards enriquecidos + card "Próximas faturas"

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `MonthStatCards` (Task 3), `upcomingCardCommitments` (Task 2), `decimalToCents` (`lib/money.ts`), `CreditCard` (lucide-react).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Trocar a montagem de `views` para expor `budgetLine`**

Em `app/(app)/dashboard/page.tsx`, o bloco atual (após `const today = todayISOInSaoPaulo();`):

```ts
const views =
  budget && realViews.length > 0
    ? [...realViews, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]
    : realViews;
```

vira:

```ts
const budgetLine = budget && realViews.length > 0 ? dailyBudgetLine(month, today, budget.perDayCents) : null;
const views = budgetLine ? [...realViews, dailyBudgetEntryView(budgetLine)] : realViews;
```

- [ ] **Step 2: Substituir a grade de 4 StatCards**

Remover o bloco `<div className="grid grid-cols-2 gap-3 md:grid-cols-4">…</div>` com os 4 `<StatCard …/>` e usar:

```tsx
<MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} />
```

Imports: adicionar `import { MonthStatCards } from "@/components/MonthStatCards";` e remover os imports que ficarem órfãos (`StatCard`, `TrendingDown`, `Wallet`, `Clock`, e de `@/lib/calc` os que a página não usar mais — `plannedIncome`/`plannedExpense`/`plannedBalance` continuam usados pelo gráfico de 12 meses; `remainingToPay` sai). `TrendingUp` continua usado pelo card Investimentos.

- [ ] **Step 3: Calcular as próximas faturas reutilizando `rangeRows`**

Logo após o bloco que monta `balanceData` (que já tem `chartMonths` e `rangeRows` em escopo):

```ts
// Compras de cartão já roteadas para as faturas dos 3 meses seguintes:
// reaproveita rangeRows (12 meses já buscados para o gráfico). Visibilidade
// apenas — o gasto conta no mês em que a fatura vence.
const nextThree = new Set(chartMonths.slice(1, 4));
const upcomingFaturas = upcomingCardCommitments(
  rangeRows
    .filter((r) => r.cardId !== null && nextThree.has(monthStringFromDate(r.month)))
    .map((r) => ({ month: monthStringFromDate(r.month), plannedCents: decimalToCents(String(r.plannedAmount)) })),
);
```

Imports: `upcomingCardCommitments` de `@/lib/card-entry`; `decimalToCents` junto de `formatCents`/`sumCents` em `@/lib/money`; `CreditCard` junto dos demais ícones de `lucide-react`.

- [ ] **Step 4: Adicionar o card "Próximas faturas"**

Dentro do `<div className="grid grid-cols-1 gap-4 md:grid-cols-2">`, após o card "Renovações":

```tsx
<Card>
  <CardHeader className="flex items-center justify-between gap-2">
    <CardTitle>Próximas faturas</CardTitle>
    <CreditCard className="size-4 text-muted-foreground" />
  </CardHeader>
  <CardContent className="space-y-2">
    {upcomingFaturas.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nada comprometido nas próximas faturas.</p>
    ) : (
      <ul className="space-y-1.5">
        {upcomingFaturas.map((f) => (
          <li key={f.month} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{formatCompetencia(monthToDate(f.month))}</span>
            <span className="font-medium tabular-nums">{formatCents(f.totalCents)}</span>
          </li>
        ))}
      </ul>
    )}
    <p className="text-xs text-muted-foreground">
      Compras no cartão que já vão cair nos próximos meses.
    </p>
    <Button asChild variant="outline" size="sm">
      <Link href="/cartoes">Ver cartões</Link>
    </Button>
  </CardContent>
</Card>
```

- [ ] **Step 5: Verificar**

Run: `npm test && npm run lint`
Expected: PASS / sem erros (inclusive o unused da Task 3 resolvido).

- [ ] **Step 6: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat: dashboard com progresso de pagamento e próximas faturas"
```

---

### Task 5: Tela Mês — cards, atrasados, pagos esmaecidos e contador por categoria

**Files:**
- Modify: `app/(app)/mes/page.tsx`

**Interfaces:**
- Consumes: `MonthStatCards` (Task 3), `isOverdue` (Task 1), `cn` (`lib/utils`).
- Produces: `DisplayRow` ganha o campo `overdue: boolean`.

- [ ] **Step 1: Calcular `overdue` ao montar as linhas**

Em `app/(app)/mes/page.tsx`:

1. Adicionar `overdue: boolean;` ao type `DisplayRow` (junto de `readOnlyHint`).
2. Hoistar o "hoje" para antes de `realViews` e reusar na reserva:

```ts
const today = todayISOInSaoPaulo();
const realViews: DisplayRow[] = rows.map((r) => {
  const view = {
    ...toEntryView(r as never),
    entryId: r.id,
    itemId: r.itemId,
    // Consolidado do cartão não tem data de compra: o "Dia" útil ali é o
    // vencimento da fatura (antes ficava "—").
    dueDay: r.item?.dueDay ?? (r.purchaseDate === null ? r.card?.dueDay ?? null : null),
    renewsThisMonth: r.item?.renewalMonth === monthDate.getUTCMonth() + 1,
    purchaseDate: r.purchaseDate,
    paidDate: r.paidDate,
    cardId: r.cardId,
    cardName: r.card?.name ?? null,
    installmentId: r.installmentId,
    installmentSeq: r.installmentSeq,
    installmentCount: r.installmentCount,
    readOnlyHint: null,
    overdue: false,
  };
  return { ...view, overdue: isOverdue(view, month, today) };
});
```

3. Na chamada existente `dailyBudgetLine(month, todayISOInSaoPaulo(), budget.perDayCents)` usar a variável `today`. Na linha derivada da reserva (objeto literal dentro de `views`), adicionar `overdue: false,`.

Imports: adicionar `isOverdue` ao import de `@/lib/calc` e `import { cn } from "@/lib/utils";`.

- [ ] **Step 2: Destacar atraso e esmaecer pagos no `EntryRow`**

Dentro de `EntryRow`, antes dos `return`:

```tsx
const dayClass = row.overdue ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground";
const daySuffix = row.overdue ? " ⚠" : "";
```

Variante desktop — o `<tr>` e a célula "Dia" viram:

```tsx
<tr className={cn("border-b last:border-b-0", row.paid && "opacity-60")}>
```

```tsx
<td className={cn("px-3 py-1.5 tabular-nums", dayClass)}>
  {dayLabel ?? "—"}
  {daySuffix}
</td>
```

Variante mobile — o wrapper e o rótulo do dia viram:

```tsx
<div className={cn("flex flex-col gap-2 p-3", row.paid && "opacity-60")}>
```

```tsx
<span className={cn("text-xs tabular-nums shrink-0", dayClass)}>
  {row.dueDay ? `Dia ${row.dueDay}` : dayLabel ?? "—"}
  {daySuffix}
</span>
```

- [ ] **Step 3: Trocar a grade de cards e adicionar o contador por categoria**

1. Substituir o bloco `<div className="grid grid-cols-2 md:grid-cols-4 gap-3">…</div>` (4 StatCards) por:

```tsx
<MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} />
```

Imports: `MonthStatCards` de `@/components/MonthStatCards`; remover imports órfãos (`StatCard`, `TrendingUp`, `TrendingDown`, `Wallet`, `Clock` e, de `@/lib/calc`, `plannedIncome`/`plannedExpense`/`plannedBalance`/`remainingToPay` — `groupByCategory` e `isOverdue` ficam).

2. No `groups.map`, trocar o corpo de expressão por bloco para calcular o contador, e exibi-lo no header:

```tsx
{groups.map((g) => {
  // Contador "pagos": só linhas reais — a reserva derivada não é pagável.
  const payable = g.rows.filter((r) => !r.readOnlyHint);
  const paidCount = payable.filter((r) => r.paid).length;
  const doneLabel =
    g.categoryType === "INCOME"
      ? payable.length === 1 ? "recebido" : "recebidos"
      : payable.length === 1 ? "pago" : "pagos";
  return (
    <Card key={`${g.categoryType}:${g.categoryName}`}>
      <CardHeader className="flex items-center justify-between gap-2 border-b">
        <div className="font-medium">{g.categoryName}</div>
        <div className="flex items-center gap-2">
          {payable.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {paidCount}/{payable.length} {doneLabel}
            </span>
          )}
          <Badge variant={g.categoryType === "INCOME" ? "default" : "secondary"}>
            {g.categoryType === "INCOME" ? "Receita" : "Despesa"}
          </Badge>
          <span className="font-semibold tabular-nums">{formatCents(g.subtotalCents)}</span>
        </div>
      </CardHeader>
      {/* CardContent existente permanece igual */}
    </Card>
  );
})}
```

(O conteúdo do `<CardContent>` — tabela desktop e mini-cards mobile — não muda nesta etapa; apenas o header ganha o contador.)

- [ ] **Step 4: Verificar**

Run: `npm test && npm run lint`
Expected: PASS / sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/mes/page.tsx
git commit -m "feat: tela Mês com progresso, atrasados e contador por categoria"
```

---

### Task 6: Verificação visual (Playwright) + suíte completa

**Files:**
- Patch temporário (NUNCA commitar): `middleware.ts`, `app/(app)/layout.tsx`
- Create temporário (deletar depois): `scripts/_shoot.mjs`

**Interfaces:**
- Consumes: build do app com as Tasks 3–5 aplicadas.
- Produces: screenshots conferidos; branch pronta para review.

- [ ] **Step 1: Bypass temporário de auth**

1. `middleware.ts` → substituir o conteúdo por pass-through:

```ts
import { NextResponse } from "next/server";
export function middleware() {
  return NextResponse.next();
}
```

2. Em `app/(app)/layout.tsx`, localizar com `grep -n 'redirect' "app/(app)/layout.tsx"` e remover/comentar a linha do `redirect("/login")`.

NUNCA commitar esses dois patches.

- [ ] **Step 2: Build e servidor**

```bash
npm run build && npx next start -p 3123
```

(servidor em background; usa o banco do `.env` — páginas somente leitura.)

- [ ] **Step 3: Screenshots**

Criar `scripts/_shoot.mjs` (dentro do projeto — fora dele o import de `@playwright/test` não resolve):

```js
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

mkdirSync("screens", { recursive: true });
const pages = [
  ["dashboard", "/dashboard?month=2026-07"],
  ["mes", "/mes?month=2026-07"],
];
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  for (const [vpName, viewport] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    for (const [name, path] of pages) {
      await page.goto(`http://localhost:3123${path}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: `screens/${name}-${vpName}-${scheme}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
```

Run: `node scripts/_shoot.mjs`

- [ ] **Step 4: Conferir os PNGs (Read é multimodal) e iterar**

Checklist visual em julho/2026 (mês sem receita, 3 de 4 diaristas pagas):
- Despesas: barra ~57% e detalhe "R$ 660,00 pago · R$ 490,00 falta".
- Saldo: "—" com "sem receitas lançadas" (NÃO −R$ 1.150,00 vermelho).
- Receitas: "nenhuma receita lançada", sem barra.
- Falta pagar: "1 conta + reserva".
- Dashboard: card "Próximas faturas" presente (com meses ou estado vazio).
- Mês: diaristas pagas esmaecidas, contador "3/4 pagos" em Moradia, reserva sem contador de pagamento.
- Nada estourando largura no mobile (390px); dark mode legível.

Se algo estiver errado: corrigir, `npm run build`, reiniciar o server, repetir screenshots. (Elementos fixed no meio de screenshots fullPage são artefato conhecido, não bug.)

- [ ] **Step 5: Reverter patches e limpar**

```bash
git checkout -- middleware.ts "app/(app)/layout.tsx"
rm -rf scripts/_shoot.mjs screens
git status   # deve mostrar árvore limpa
```

- [ ] **Step 6: Suíte completa**

Run: `npm test && npm run lint && npm run build`
Expected: tudo PASS/verde.

- [ ] **Step 7: Commit final (se houve correções na iteração visual)**

```bash
git add -A && git status  # conferir que só entram arquivos do feature
git commit -m "fix: ajustes visuais da visualização do mês"
```
