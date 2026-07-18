# Redesign Fase 3 — Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o visual fintech (shadcn) ao Dashboard: KPI `StatCard`s, `MonthNav`, gráficos em `Card` com tema claro/escuro, ranking em barras horizontais, tudo responsivo — sem mudar domínio/dados.

**Architecture:** A página `app/(app)/dashboard/page.tsx` mantém toda a lógica server (queries, `expenseByCategory`, `expenseRanking`, projeção, KPIs). Reutiliza `StatCard` (Fase 2), `MonthNav` (Fase 1), `formatCents`. Os gráficos (`components/charts/ExpensePie.tsx`, `BalanceProjection.tsx`) são polidos para tema-aware (Recharts 3 cru, sem shadcn-chart, usando `currentColor`/tokens). Ranking vira barras.

**Tech Stack:** Next 16, React 19, TS, Tailwind v4, shadcn/ui (card, badge…), Recharts 3, lucide-react.

## Global Constraints

- **Sem mudança de domínio/dados/Server Actions.** Não editar `prisma/`, `lib/**`, actions. Só apresentação (`dashboard/page.tsx` + os 2 componentes de gráfico + talvez um `RankingBars`).
- **Dinheiro:** exibição via `formatCents` (pt-BR); `tabular-nums`.
- **Tema claro/escuro:** textos/eixos dos gráficos via `currentColor` herdando de uma cor de token (`text-muted-foreground`), NÃO cores fixas escuras (senão somem no dark). Linha da projeção em azul (`#3b82f6`, lê bem em claro/escuro).
- **Dataviz (regras aplicadas):** linha = série única, SEM legenda (título nomeia), 2px, grid recessivo, tooltip; pizza = rosca (donut) com **legenda** (≥2 séries) + tooltip, cores POR CATEGORIA (identidade, `Category.color`), texto em tokens de tinta (não na cor da série); ranking = barras horizontais, extremidade arredondada, **rótulo de valor direto**, hue único. Uma cor de status nunca vira "série". Render-and-look real é teste manual (adiado).
- **Verificação por task:** `npx tsc --noEmit` + `npm run build` + `npm test` (31) + `npm run lint` verdes.
- **Commits:** um por task; terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Estado atual (referência)

- `dashboard/page.tsx` (server): `month`/`searchParams`, KPIs (`plannedIncome/Expense/Balance/remainingToPay`), `pieData` = `expenseByCategory` + cor da categoria, `proj` = saldo dos próximos 6 meses, ranking (`expenseRanking` top 10). Usa um `Card` local simples e uma `<ol>` para o ranking.
- `components/charts/ExpensePie.tsx` (client): `PieChart`/`Pie`/`Cell`/`Tooltip`/`ResponsiveContainer`; `formatCents` no tooltip; recebe `data: {categoryName, value(cents), color}[]`.
- `components/charts/BalanceProjection.tsx` (client): `LineChart`/`Line`/`XAxis`/`YAxis`/`Tooltip`; `formatCents`/`toLocaleString` pt-BR; recebe `data: {month, balance(cents)}[]`.
- Reutilizáveis: `@/components/StatCard` (`{label, value, tone}`), `@/components/MonthNav` (`{month, basePath}`), `@/components/ui/card`, `@/components/ui/badge`.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/(app)/dashboard/page.tsx` | reskin: MonthNav + StatCards + gráficos em Card + ranking em barras; grid responsivo |
| `components/charts/RankingBars.tsx` | (novo) barras horizontais do ranking (nome + barra proporcional + valor) |
| `components/charts/ExpensePie.tsx` | donut + legenda + tooltip + tema-aware |
| `components/charts/BalanceProjection.tsx` | linha azul + grid recessivo + tooltip + tema-aware |

---

## Task 1: Reskin do Dashboard (MonthNav + StatCards + gráficos em Card + ranking em barras)

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Create: `components/charts/RankingBars.tsx`

**Interfaces:**
- Consumes: `StatCard`, `MonthNav`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `ExpensePie`, `BalanceProjection`, `formatCents`, funções de `lib/calc`.
- Produces: `RankingBars({ data }: { data: { itemName: string; cents: number }[] })` — barras horizontais.

- [ ] **Step 1: `components/charts/RankingBars.tsx`** (server component, sem estado)

```tsx
import { formatCents } from "@/lib/money";

export function RankingBars({ data }: { data: { itemName: string; cents: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.cents));
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate">{d.itemName}</span>
            <span className="tabular-nums text-muted-foreground">{formatCents(d.cents)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(d.cents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Reskin `dashboard/page.tsx`** (manter toda a lógica server)
- Header: título "Dashboard — {competência}" + `<MonthNav month={month} basePath="/dashboard" />`.
- KPIs: grid `grid-cols-2 md:grid-cols-4 gap-3` com `<StatCard>` (Receitas=income, Despesas=expense, Saldo=default, Falta pagar=warn).
- Gráficos: grid `grid-cols-1 md:grid-cols-2 gap-4`, cada um num `<Card>` (`CardHeader`+`CardTitle` "Despesas por categoria" / "Projeção de saldo"; `CardContent` com `<ExpensePie>` / `<BalanceProjection>`).
- Ranking: `<Card>` com `CardTitle` "Ranking de despesas" e `<RankingBars data={expenseRanking(views).slice(0,10)} />`.
- Remover o `Card` local antigo.
- Empty (mês sem despesas): pizza/ranking podem ficar vazios — mostrar um texto discreto "Sem despesas neste mês" no lugar dos gráficos quando `views` não tiver despesas (opcional, se simples).

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31), `npm run lint`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(dashboard): reskin com MonthNav, StatCards, gráficos em Card e ranking em barras" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Gráficos tema-aware + polish (ExpensePie donut+legenda, BalanceProjection linha azul+grid)

**Files:**
- Modify: `components/charts/ExpensePie.tsx`, `components/charts/BalanceProjection.tsx`

**Regras dataviz a aplicar** (ver Global Constraints): tema-aware via `currentColor`; linha única sem legenda; donut com legenda; texto em tokens de tinta; tooltip em ambos.

- [ ] **Step 1: `ExpensePie.tsx`** — donut + legenda + tema-aware
- `Pie` com `innerRadius={60} outerRadius={100} paddingAngle={2}` (rosca, com respiro entre fatias). Manter `Cell` com a cor da categoria (`data[i].color`).
- Adicionar `<Legend />` do Recharts (identidade não fica só na cor). 
- `<Tooltip formatter={(v) => formatCents(Number(v))} />` (mantém).
- Tema: envolver o `ResponsiveContainer` num wrapper com `className="text-muted-foreground"`; o `<Legend />` herda `currentColor` para o texto (garantir `wrapperStyle`/`formatter` usando cor de tinta, não a cor da fatia). Se a legenda ficar muito grande, limitar/`layout` conforme espaço.
- Estado vazio: se `data.length === 0`, renderizar um placeholder discreto ("Sem despesas") em vez do PieChart.

- [ ] **Step 2: `BalanceProjection.tsx`** — linha azul + grid recessivo + tema-aware
- `<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />` (grid recessivo).
- `<Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />` (azul, 2px, marcadores).
- Eixos com texto tema-aware: `<XAxis dataKey="month" tick={{ fill: "currentColor" }} className="text-muted-foreground text-xs" />` e `<YAxis tick={{ fill: "currentColor" }} className="text-muted-foreground text-xs" tickFormatter={(v) => (Number(v)/100).toLocaleString("pt-BR",{maximumFractionDigits:0})} />`.
- `<Tooltip formatter={(v) => formatCents(Number(v))} />` (mantém). Série única → SEM legenda.
- Envolver num wrapper `className="text-muted-foreground"` para o `currentColor` resolver.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (31), `npm run lint`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(dashboard): gráficos tema-aware (donut+legenda, linha azul+grid) pt-BR" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (feita)

- **Cobertura da spec (Dashboard):** KPI cards (StatCard) ✔, gráfico despesas por categoria (donut+legenda) ✔, projeção de saldo (linha) ✔, ranking (barras) ✔, seletor de mês (MonthNav) ✔, responsivo ✔. Sem mudança de domínio.
- **Dataviz:** linha única sem legenda; donut com legenda; cores por categoria (identidade); texto em tokens; grid recessivo; tooltips; tema claro/escuro via currentColor. Render-and-look real fica p/ teste manual (sem navegador aqui) — anotar.
- **Placeholders:** nenhum "TBD"; `RankingBars` com código completo; gráficos com props/estrutura concretas.
- **Consistência:** `StatCard`/`MonthNav`/`formatCents` reutilizados; assinaturas de `ExpensePie`/`BalanceProjection` preservadas (page continua passando `pieData`/`proj`); `RankingBars` recebe `expenseRanking(...)` (que retorna `{itemName,cents}[]`).
