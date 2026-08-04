# Fluxo de caixa por dia (v1.2.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card "Fluxo de caixa" na tela Mês com o saldo acumulado dia a dia (realizado + previsto) e veredito no cabeçalho ("positivo o mês todo" / "R$ −Z no dia W"), como release v1.2.0.

**Architecture:** `lib/cashflow.ts` puro calcula a série diária e o veredito a partir das linhas que a página já monta (`realViews` + reserva diária via `budgetLine` — NUNCA `views`, que já contém a linha derivada e a duplicaria); `CashflowCard` (client) renderiza colapso + gráfico de área Recharts no padrão de `components/charts/MonthlyBalance.tsx`. Spec: `docs/superpowers/specs/2026-08-04-fluxo-caixa-diario-design.md`.

**Tech Stack:** Next.js App Router, Recharts (já no projeto), Vitest.

## Global Constraints

- Semântica do spec: acumulado do zero; pago → data real (`paidDate`) + valor real (`paidCents ?? plannedCents`); aberto → `dueDay`, senão dia de `purchaseDate`, senão pessimista (despesa dia 1, receita último dia); pago fora do mês de competência encosta na borda (antes → dia 1, depois → último dia); reserva diária = `perDayCents` nos dias cobertos (futuro: todos; corrente: de hoje em diante; passado: nenhum).
- Datas em UTC (`getUTCDate()`), pt-BR na UI, centavos inteiros com `formatCents`.
- Card recolhido por padrão; veredito sempre visível; `aria-expanded`; estado não persiste (o card fica FORA do `MonthEntryList`, então recebe `key` própria? Não — ele é remontado junto com a página a cada navegação server-side; sem estado a preservar entre meses pois `open` default é false e a página re-renderiza por completo. Não adicionar key).
- Versão desta entrega: `1.2.0` + entrada no changelog no mesmo commit (política de entrega do AGENTS.md).
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: `lib/cashflow.ts` + testes

**Files:**
- Create: `lib/cashflow.ts`
- Test: `tests/cashflow.test.ts`

**Interfaces:**
- Consumes: `daysInMonth` de `@/lib/daily-budget`.
- Produces (Task 2 consome): tipos `CashflowRow`, `CashflowDay`, `CashflowVerdict`, `Cashflow` e a função `dailyCashflow(rows, month, todayISO, budget)` — assinaturas exatas abaixo.

- [ ] **Step 1: Write the failing test**

Crie `tests/cashflow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dailyCashflow, type CashflowRow } from "@/lib/cashflow";

const base = { paid: false, paidCents: null, paidDate: null, dueDay: null, purchaseDate: null };
const income = (over: Partial<CashflowRow>): CashflowRow => ({ ...base, categoryType: "INCOME", plannedCents: 0, ...over });
const expense = (over: Partial<CashflowRow>): CashflowRow => ({ ...base, categoryType: "EXPENSE", plannedCents: 0, ...over });

describe("dailyCashflow", () => {
  it("acumula receitas e despesas pelos vencimentos", () => {
    const { days, verdict } = dailyCashflow(
      [income({ plannedCents: 100_00, dueDay: 5 }), expense({ plannedCents: 40_00, dueDay: 10 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(days).toHaveLength(31);
    expect(days[3].cumulativeCents).toBe(0);
    expect(days[4].cumulativeCents).toBe(100_00);
    expect(days[9].cumulativeCents).toBe(60_00);
    expect(days[30].cumulativeCents).toBe(60_00);
    expect(verdict).toEqual({ alwaysPositive: true });
  });

  it("fica negativo quando a despesa vence antes da receita", () => {
    const { verdict } = dailyCashflow(
      [expense({ plannedCents: 50_00, dueDay: 3 }), income({ plannedCents: 100_00, dueDay: 20 })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(verdict).toEqual({
      alwaysPositive: false,
      firstNegativeDay: 3,
      lastNegativeDay: 19,
      minCents: -50_00,
      minDay: 3,
    });
  });

  it("pago entra na data real com o valor real", () => {
    const { days } = dailyCashflow(
      [expense({ plannedCents: 100_00, dueDay: 20, paid: true, paidCents: 90_00, paidDate: new Date("2026-08-02T00:00:00Z") })],
      "2026-08",
      "2026-08-15",
      null,
    );
    expect(days[1].outCents).toBe(90_00);
    expect(days[19].outCents).toBe(0);
  });

  it("pago fora do mês de competência encosta na borda", () => {
    const { days } = dailyCashflow(
      [
        expense({ plannedCents: 10_00, paid: true, paidCents: 10_00, paidDate: new Date("2026-07-28T00:00:00Z"), dueDay: 10 }),
        income({ plannedCents: 20_00, paid: true, paidCents: 20_00, paidDate: new Date("2026-09-02T00:00:00Z"), dueDay: 15 }),
      ],
      "2026-08",
      "2026-08-15",
      null,
    );
    expect(days[0].outCents).toBe(10_00);
    expect(days[30].inCents).toBe(20_00);
  });

  it("sem data é pessimista: despesa no dia 1, receita no último", () => {
    const { days } = dailyCashflow([expense({ plannedCents: 30_00 }), income({ plannedCents: 80_00 })], "2026-08", "2026-08-01", null);
    expect(days[0].outCents).toBe(30_00);
    expect(days[30].inCents).toBe(80_00);
  });

  it("avulso em aberto usa o dia da compra", () => {
    const { days } = dailyCashflow(
      [expense({ plannedCents: 25_00, purchaseDate: new Date("2026-08-12T00:00:00Z") })],
      "2026-08",
      "2026-08-01",
      null,
    );
    expect(days[11].outCents).toBe(25_00);
  });

  it("dueDay maior que o mês encosta no último dia", () => {
    const { days } = dailyCashflow([expense({ plannedCents: 10_00, dueDay: 31 })], "2026-02", "2026-01-01", null);
    expect(days).toHaveLength(28);
    expect(days[27].outCents).toBe(10_00);
  });

  it("reserva do dia a dia dilui por dia coberto", () => {
    const r1 = dailyCashflow([], "2026-08", "2026-08-30", { perDayCents: 100_00 });
    expect(r1.days[28].outCents).toBe(0);
    expect(r1.days[29].outCents).toBe(100_00);
    expect(r1.days[30].outCents).toBe(100_00);
    const r2 = dailyCashflow([], "2026-09", "2026-08-30", { perDayCents: 100_00 });
    expect(r2.days.every((d) => d.outCents === 100_00)).toBe(true);
    const r3 = dailyCashflow([], "2026-07", "2026-08-30", { perDayCents: 100_00 });
    expect(r3.days.every((d) => d.outCents === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cashflow.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cashflow'`.

- [ ] **Step 3: Write the implementation**

Crie `lib/cashflow.ts`:

```ts
import { daysInMonth } from "@/lib/daily-budget";

/** Subconjunto de DisplayRow que o fluxo diário precisa (estruturalmente compatível). */
export type CashflowRow = {
  categoryType: "INCOME" | "EXPENSE";
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  paidDate: Date | null;
  dueDay: number | null;
  purchaseDate: Date | null;
};

export type CashflowDay = { day: number; inCents: number; outCents: number; cumulativeCents: number };

export type CashflowVerdict =
  | { alwaysPositive: true }
  | { alwaysPositive: false; firstNegativeDay: number; lastNegativeDay: number; minCents: number; minDay: number };

export type Cashflow = { days: CashflowDay[]; verdict: CashflowVerdict };

/** Dia (1..total) em que a linha conta no fluxo do mês. */
function flowDay(row: CashflowRow, month: string, total: number): number {
  const clamp = (d: number) => Math.min(Math.max(d, 1), total);
  if (row.paid && row.paidDate) {
    const paidMonth = row.paidDate.toISOString().slice(0, 7);
    // Pago fora do mês de competência encosta na borda (antes → dia 1; depois → último).
    if (paidMonth < month) return 1;
    if (paidMonth > month) return total;
    return clamp(row.paidDate.getUTCDate());
  }
  if (row.dueDay !== null) return clamp(row.dueDay);
  if (row.purchaseDate) return clamp(row.purchaseDate.getUTCDate());
  // Sem data: pessimista — a despesa cobra logo, a receita só entra no fim.
  return row.categoryType === "EXPENSE" ? 1 : total;
}

/**
 * Saldo acumulado dia a dia do mês, partindo de zero: pago entra na data real
 * com o valor real; aberto entra na data prevista. `budget` é a reserva do dia
 * a dia (perDayCents nos dias cobertos), passada à parte para não duplicar com
 * a linha derivada da lista.
 */
export function dailyCashflow(
  rows: CashflowRow[],
  month: string,
  todayISO: string,
  budget: { perDayCents: number } | null,
): Cashflow {
  const total = daysInMonth(month);
  const inByDay: number[] = new Array(total + 1).fill(0);
  const outByDay: number[] = new Array(total + 1).fill(0);

  for (const row of rows) {
    const cents = row.paid ? (row.paidCents ?? row.plannedCents) : row.plannedCents;
    const day = flowDay(row, month, total);
    if (row.categoryType === "INCOME") inByDay[day] += cents;
    else outByDay[day] += cents;
  }

  if (budget) {
    const todayMonth = todayISO.slice(0, 7);
    const start = month > todayMonth ? 1 : month < todayMonth ? total + 1 : Number(todayISO.slice(8, 10));
    for (let d = start; d <= total; d++) outByDay[d] += budget.perDayCents;
  }

  const days: CashflowDay[] = [];
  let cumulative = 0;
  for (let d = 1; d <= total; d++) {
    cumulative += inByDay[d] - outByDay[d];
    days.push({ day: d, inCents: inByDay[d], outCents: outByDay[d], cumulativeCents: cumulative });
  }

  const negatives = days.filter((x) => x.cumulativeCents < 0);
  if (negatives.length === 0) return { days, verdict: { alwaysPositive: true } };
  const min = negatives.reduce((a, b) => (b.cumulativeCents < a.cumulativeCents ? b : a));
  return {
    days,
    verdict: {
      alwaysPositive: false,
      firstNegativeDay: negatives[0].day,
      lastNegativeDay: negatives[negatives.length - 1].day,
      minCents: min.cumulativeCents,
      minDay: min.day,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cashflow.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/cashflow.ts tests/cashflow.test.ts
git commit -m "feat: cálculo do fluxo de caixa diário"
```

---

### Task 2: `CashflowCard` + integração na página do Mês

**Files:**
- Create: `app/(app)/mes/CashflowCard.tsx`
- Modify: `app/(app)/mes/page.tsx`

**Interfaces:**
- Consumes: `dailyCashflow`, `CashflowDay`, `CashflowVerdict` (Task 1); Recharts; `formatCents`; `Card`/`CardHeader`/`CardContent`.
- Produces: `CashflowCard({ days, verdict, todayDay })`.

- [ ] **Step 1: Criar `app/(app)/mes/CashflowCard.tsx`**

Padrão visual dos charts do app (`components/charts/MonthlyBalance.tsx`): cores `#10b981`/`#f43f5e`, tooltip custom, eixos sem linha, `notation: "compact"`. Conteúdo completo:

```tsx
"use client";
import { useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashflowDay, CashflowVerdict } from "@/lib/cashflow";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const POSITIVE = "#10b981"; // emerald-500 (tom de receita do app)
const NEGATIVE = "#f43f5e"; // rose-500 (tom de despesa do app)

function FlowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: CashflowDay }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">Dia {p.day}</div>
      <div className="space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Entradas</span>
          <span>{formatCents(p.inCents)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Saídas</span>
          <span>{formatCents(p.outCents)}</span>
        </div>
        <div className="flex justify-between gap-4 font-medium">
          <span>Acumulado</span>
          <span style={{ color: p.cumulativeCents < 0 ? NEGATIVE : POSITIVE }}>{formatCents(p.cumulativeCents)}</span>
        </div>
      </div>
    </div>
  );
}

/** Card recolhível do fluxo de caixa: veredito sempre visível, gráfico ao expandir. */
export function CashflowCard({
  days,
  verdict,
  todayDay,
}: {
  days: CashflowDay[];
  verdict: CashflowVerdict;
  todayDay: number | null;
}) {
  const [open, setOpen] = useState(false);

  // Gradiente dividido no zero: verde acima, vermelho abaixo (proporção pela amplitude).
  const max = Math.max(...days.map((d) => d.cumulativeCents), 0);
  const min = Math.min(...days.map((d) => d.cumulativeCents), 0);
  const zeroOffset = max === min ? 1 : max / (max - min);

  return (
    <Card>
      <CardHeader className={cn(open && "border-b")}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="font-medium">Fluxo de caixa</span>
          <span className="flex items-center gap-2">
            {verdict.alwaysPositive ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="size-3.5" />
                Positivo o mês todo
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <TrendingDown className="size-3.5" />
                {formatCents(verdict.minCents)} no dia {verdict.minDay}
              </span>
            )}
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="text-muted-foreground">
          {!verdict.alwaysPositive && (
            <p className="mb-2 text-xs">
              Fica negativo do dia {verdict.firstNegativeDay} ao dia {verdict.lastNegativeDay}; pior momento:{" "}
              {formatCents(verdict.minCents)} no dia {verdict.minDay}.
            </p>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={days} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                {/* Um único CashflowCard por página: ids fixos não colidem. */}
                <linearGradient id="cashflow-stroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={0.9} />
                  <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="cashflow-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={zeroOffset} stopColor={POSITIVE} stopOpacity={0.18} />
                  <stop offset={zeroOffset} stopColor={NEGATIVE} stopOpacity={0.18} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "currentColor", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  (Number(v) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0, notation: "compact" })
                }
              />
              <Tooltip content={<FlowTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }} />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
              {todayDay !== null && (
                <ReferenceLine
                  x={todayDay}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeDasharray="4 4"
                  label={{ value: "hoje", position: "top", fill: "currentColor", fontSize: 11 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="cumulativeCents"
                stroke="url(#cashflow-stroke)"
                strokeWidth={2}
                fill="url(#cashflow-fill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Integrar na página**

Em `app/(app)/mes/page.tsx`:

1. Imports novos: `import { dailyCashflow } from "@/lib/cashflow";` e `import { CashflowCard } from "./CashflowCard";`
2. Após a montagem de `budgetLine` (e antes do `return`), calcule:

```tsx
// Fluxo diário usa realViews + reserva à parte — `views` duplicaria a linha derivada.
const cashflow = dailyCashflow(realViews, month, today, budgetLine ? { perDayCents: budgetLine.perDayCents } : null);
const todayDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : null;
```

3. No JSX, entre `<MonthStatCards …/>` e `<MonthEntryList …/>` (dentro do branch não-vazio):

```tsx
<CashflowCard days={cashflow.days} verdict={cashflow.verdict} todayDay={todayDay} />
```

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde (lint: só os 4 warnings pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/mes/CashflowCard.tsx app/\(app\)/mes/page.tsx
git commit -m "feat: card de fluxo de caixa na tela do Mês"
```

---

### Task 3: Bump v1.2.0 + changelog + verificação final

**Files:**
- Modify: `package.json`, `package-lock.json`, `lib/changelog.ts`

- [ ] **Step 1: Bump e entrada do changelog**

`package.json`: `"version": "1.1.1"` → `"version": "1.2.0"`; rode `npm install --package-lock-only`.

Em `lib/changelog.ts`, adicione NO TOPO do array:

```ts
  {
    version: "1.2.0",
    date: "2026-08-04",
    title: "Fluxo de caixa por dia",
    items: [
      "A tela do Mês ganhou o saldo acumulado dia a dia: o que já aconteceu entra pela data real e o que falta, pela data de vencimento.",
      "O cabeçalho do card avisa na hora se o mês fica no vermelho e qual é o pior dia; toque para abrir o gráfico completo.",
    ],
  },
```

- [ ] **Step 2: Verificar suítes + commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde (`tests/changelog.test.ts` confirma o sincronismo 1.2.0).

```bash
git add package.json package-lock.json lib/changelog.ts
git commit -m "chore: versão 1.2.0 e changelog"
```

- [ ] **Step 3: e2e**

Run: `npm run e2e`
Expected: 7/7. Se falhar no reset do banco com mensagem vazia, rode `npx tsx scripts/e2e-reset-db.ts` isolado e repita.

- [ ] **Step 4: Verificação visual (dados reais, somente leitura)**

Suba `APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3189` e com Playwright (script temporário dentro do projeto, deletar ao final; login /login, `input[name="password"]`, "visual-teste"; screenshots em pasta do workspace SDD; aguardar animações antes de capturar):

1. Desktop 1280×800 em `/mes` (agosto/2026): card "Fluxo de caixa" recolhido entre os stat cards e a busca, com veredito no cabeçalho. Screenshot.
2. Expandir: gráfico de área com linha do zero, marcador "hoje" e trecho negativo em vermelho (se houver); tooltip sobre um dia. Screenshots.
3. Navegar para um mês futuro (›): veredito/curva recalculados, sem marcador "hoje". Screenshot.
4. Mobile 390×844: card recolhido legível; expandido sem overflow horizontal da página. Screenshots.
5. Encerrar servidor, deletar script, `git status` limpo.
