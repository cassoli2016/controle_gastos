# Entrega v1.1.0 — filtro do Mês, Novidades e investido × atual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Busca instantânea de contas na tela do Mês com cards de reserva recolhidos, página Novidades alimentada por changelog em código, e comparação investido × valor atual por ativo — tudo como release v1.1.0.

**Architecture:** A renderização dos cards de categoria sai de `app/(app)/mes/page.tsx` para o client component `MonthEntryList` (busca e recolhimento são estado de navegador); a filtragem pura vive em `lib/month-filter.ts`. A página `/novidades` renderiza `lib/changelog.ts` (array tipado, atualizado a cada entrega junto do bump de versão — um teste trava esse sincronismo). Investimentos ganham a coluna "Investido" usando `costCents` que `calcPosition` já expõe. Specs: `docs/superpowers/specs/2026-08-04-filtro-mes-reserva-recolhida-design.md`, `2026-08-04-novidades-changelog-design.md`, `2026-08-04-investimentos-investido-vs-atual-design.md`.

**Tech Stack:** Next.js App Router (client component novo), shadcn/ui (`Card`, `Input`, `Badge`), lucide-react, Vitest.

## Global Constraints

- Textos em pt-BR com acentuação correta; changelog em **linguagem de usuário** ("Busca de contas na tela do Mês"), nunca técnica.
- Cards recolhidos por padrão: **somente** as categorias com nome `RESERVE_CATEGORY.name` ("Reserva") e `RESERVE_WITHDRAWAL_CATEGORY.name` ("Retirada da reserva") de `@/lib/reserve-flow`. A categoria "Reserva do dia a dia" (`DAILY_BUDGET_LINE`) é OUTRA categoria e fica sempre aberta.
- Busca: filtra por `itemName`, ignorando maiúsculas e acentos; query vazia/só espaços mostra tudo; stat cards do topo nunca são afetados.
- A assinatura visual das linhas (EntryRow) **não muda** — só migra de arquivo.
- Versão desta entrega: `1.1.0` (package.json + primeira entrada do changelog, mesmo commit).
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Filtro puro `lib/month-filter.ts`

**Files:**
- Create: `lib/month-filter.ts`
- Test: `tests/month-filter.test.ts`

**Interfaces:**
- Consumes: nada (funções puras).
- Produces (Task 2 consome): `normalizeText(s: string): string`; `filterViews<T extends { itemName: string }>(views: T[], query: string): T[]`.

- [ ] **Step 1: Write the failing test**

Crie `tests/month-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeText, filterViews } from "@/lib/month-filter";

describe("normalizeText", () => {
  it("minúsculas e sem acentos", () => {
    expect(normalizeText("Crédito")).toBe("credito");
    expect(normalizeText("ALUGUEL")).toBe("aluguel");
    expect(normalizeText("São João")).toBe("sao joao");
  });
});

describe("filterViews", () => {
  const rows = [{ itemName: "ALUGUEL" }, { itemName: "Cartão de Crédito" }, { itemName: "Água" }];

  it("query vazia ou só espaços retorna tudo", () => {
    expect(filterViews(rows, "")).toEqual(rows);
    expect(filterViews(rows, "   ")).toEqual(rows);
  });

  it("casa parcial ignorando maiúsculas", () => {
    expect(filterViews(rows, "alug")).toEqual([rows[0]]);
  });

  it("casa ignorando acentos nos dois lados", () => {
    expect(filterViews(rows, "credito")).toEqual([rows[1]]);
    expect(filterViews(rows, "ÁGUA")).toEqual([rows[2]]);
  });

  it("sem match retorna vazio", () => {
    expect(filterViews(rows, "xyz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/month-filter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/month-filter'`.

- [ ] **Step 3: Write minimal implementation**

Crie `lib/month-filter.ts`:

```ts
/** Normaliza para busca: minúsculas e sem acentos ("Crédito" → "credito"). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Linhas cujo nome contém a busca (sem acentos/caixa). Query vazia → tudo. */
export function filterViews<T extends { itemName: string }>(views: T[], query: string): T[] {
  const q = normalizeText(query.trim());
  if (q === "") return views;
  return views.filter((v) => normalizeText(v.itemName).includes(q));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/month-filter.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/month-filter.ts tests/month-filter.test.ts
git commit -m "feat: filtro de contas por nome (puro)"
```

---

### Task 2: `MonthEntryList` client component + página do Mês

**Files:**
- Create: `app/(app)/mes/MonthEntryList.tsx`
- Modify: `app/(app)/mes/page.tsx` (remove `EntryRow`/`DisplayRow` e o render dos grupos; delega ao novo componente)

**Interfaces:**
- Consumes: `filterViews` (Task 1); `groupByCategory`, `EntryView` de `@/lib/calc`; `RESERVE_CATEGORY`, `RESERVE_WITHDRAWAL_CATEGORY` de `@/lib/reserve-flow`; `PayCell`, `PlannedCell`, `EntryActions` (client components existentes na pasta).
- Produces: `MonthEntryList({ views, month, categories, reserves })` e o tipo `DisplayRow` (exportado), que a página importa.

- [ ] **Step 1: Criar `app/(app)/mes/MonthEntryList.tsx`**

O `EntryRow` e o markup dos grupos são os ATUAIS de `page.tsx` (linhas 28–185 e 311–379) movidos para cá — não mude o markup das linhas. Conteúdo completo:

```tsx
"use client";
import { useMemo, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { groupByCategory } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { filterViews } from "@/lib/month-filter";
import { RESERVE_CATEGORY, RESERVE_WITHDRAWAL_CATEGORY } from "@/lib/reserve-flow";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PayCell } from "./PayCell";
import { PlannedCell } from "./PlannedCell";
import { EntryActions } from "./EntryActions";

export type DisplayRow = EntryView & {
  entryId: string;
  itemId: string | null;
  dueDay: number | null;
  renewsThisMonth: boolean;
  purchaseDate: Date | null;
  paidDate: Date | null;
  cardId: string | null;
  cardName: string | null;
  installmentId: string | null;
  installmentSeq: number | null;
  installmentCount: number | null;
  /** Preenchido só em linha derivada (reserva): substitui as ações, que não existem. */
  readOnlyHint: string | null;
  /** Despesa não paga com vencimento para trás (isOverdue): destaque na coluna Dia. */
  overdue: boolean;
};

/** Categorias de movimentos de caixinha: iniciam recolhidas (já concluídos). */
const RESERVE_GROUPS = new Set<string>([RESERVE_CATEGORY.name, RESERVE_WITHDRAWAL_CATEGORY.name]);

// [AQUI VAI O EntryRow INTEIRO, copiado de page.tsx linhas 46–185 sem mudanças,
//  incluindo o comentário sobre as duas variantes desktop/mobile]

export function MonthEntryList({
  views,
  month,
  categories,
  reserves,
}: {
  views: DisplayRow[];
  month: string;
  categories: { id: string; name: string }[];
  reserves: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  // Cards de reserva que o usuário abriu manualmente, por nome de categoria.
  const [manuallyOpen, setManuallyOpen] = useState<Record<string, boolean>>({});
  const searching = query.trim() !== "";
  const groups = useMemo(() => groupByCategory(filterViews(views, query)), [views, query]);

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar conta…"
          aria-label="Buscar conta"
          className="pl-9 pr-8"
        />
        {searching && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conta encontrada para &ldquo;{query.trim()}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => {
          const isReserve = RESERVE_GROUPS.has(g.categoryName);
          // Busca ativa expande o card para mostrar os matches; o estado manual
          // fica guardado e volta a valer quando a busca é limpa.
          const expanded = !isReserve || searching || manuallyOpen[g.categoryName] === true;
          // Contador "pagos": só linhas reais — a reserva derivada não é pagável.
          const payable = g.rows.filter((r) => !r.readOnlyHint);
          const paidCount = payable.filter((r) => r.paid).length;
          const doneLabel =
            g.categoryType === "INCOME"
              ? payable.length === 1 ? "recebido" : "recebidos"
              : payable.length === 1 ? "pago" : "pagos";
          const headerRight = (
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
              {isReserve && (
                <ChevronDown
                  className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              )}
            </div>
          );
          return (
            <Card key={`${g.categoryType}:${g.categoryName}`}>
              <CardHeader className={cn(expanded && "border-b")}>
                {isReserve ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setManuallyOpen((s) => ({ ...s, [g.categoryName]: !expanded }))}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="font-medium">{g.categoryName}</span>
                    {headerRight}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{g.categoryName}</div>
                    {headerRight}
                  </div>
                )}
              </CardHeader>
              {expanded && (
                <CardContent className="px-0">
                  {/* [AQUI VAI O CONTEÚDO ATUAL DO CardContent de page.tsx linhas 337–374:
                      tabela desktop (colgroup + thead + tbody com EntryRow variant="desktop")
                      e lista mobile (EntryRow variant="mobile"), sem mudanças] */}
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
```

Atenção ao copiar os dois blocos marcados `[AQUI VAI...]`: são recortes literais de `page.tsx` — o `EntryRow` completo com as props `{ row, month, variant, income, categories, reserves }` e o miolo da tabela/mobile que chama `<EntryRow …/>` passando `categories={categories}` e `reserves={reserves}` (na página original essas props vinham de `.map()` inline; aqui as props já chegam prontas).

Obs.: o header atual tinha `border-b` fixo no `CardHeader`; agora é condicional (`expanded`) para o card recolhido não mostrar uma borda pendurada.

- [ ] **Step 2: Enxugar `app/(app)/mes/page.tsx`**

1. Remova de `page.tsx`: o tipo `DisplayRow` local, a função `EntryRow` inteira, e os imports que ficarem órfãos (`groupByCategory`, `type EntryView`, `formatCents`, `cn`, `Badge`, `PayCell`, `PlannedCell`, `EntryActions`, `CardHeader`). Mantenha `isOverdue` (continua vindo de `@/lib/calc`), `toEntryView`, `dailyBudgetEntryView`, `Card`/`CardContent` (estado vazio), `Inbox`.
2. Importe: `import { MonthEntryList, type DisplayRow } from "./MonthEntryList";`
3. Remova a linha `const groups = groupByCategory(views);`
4. Substitua o bloco `<div className="space-y-4">{groups.map((g) => …)}</div>` inteiro (o que renderizava os cards de categoria) por:

```tsx
<MonthEntryList
  views={views}
  month={month}
  categories={categories.map((c) => ({ id: c.id, name: c.name }))}
  reserves={reserveOptions}
/>
```

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes), build ok.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/mes/MonthEntryList.tsx app/\(app\)/mes/page.tsx
git commit -m "feat: busca de contas e reserva recolhida na tela do Mês"
```

---

### Task 3: `lib/changelog.ts` + bump para 1.1.0

**Files:**
- Create: `lib/changelog.ts`
- Modify: `package.json` (version) e `package-lock.json`
- Test: `tests/changelog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (Task 4 consome): `type ChangelogEntry = { version: string; date: string; title: string; items: string[] }`; `CHANGELOG: ChangelogEntry[]` (mais recente primeiro).

- [ ] **Step 1: Write the failing test**

Crie `tests/changelog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHANGELOG } from "@/lib/changelog";
import { version } from "@/package.json";

describe("CHANGELOG", () => {
  it("não está vazio e a entrada mais recente é a versão do app", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG[0].version).toBe(version);
  });

  it("versões semver e datas YYYY-MM-DD", () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ordem decrescente por data", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });

  it("título e itens preenchidos", () => {
    for (const e of CHANGELOG) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.items.length).toBeGreaterThan(0);
      for (const item of e.items) expect(item.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/changelog.test.ts`
Expected: FAIL — `Cannot find module '@/lib/changelog'`.

- [ ] **Step 3: Criar `lib/changelog.ts` e bumpar a versão**

Crie `lib/changelog.ts` (histórico reconstituído dos merges reais do git — datas verificadas):

```ts
/**
 * Fonte da página /novidades. Linguagem de USUÁRIO (o que a pessoa vê, não o
 * que o código faz). Mais recente no topo. Toda entrega adiciona sua entrada
 * aqui NO MESMO COMMIT do bump de versão do package.json — o teste
 * tests/changelog.test.ts trava esse sincronismo.
 */
export type ChangelogEntry = {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    date: "2026-08-04",
    title: "Busca no Mês, Novidades e comparativo nos investimentos",
    items: [
      "Busca de contas na tela do Mês: digite parte do nome e veja só o que interessa, sem rolar a tela.",
      "Depósitos e retiradas da reserva ficam recolhidos num resumo — toque no cabeçalho para ver o detalhe.",
      "Página Novidades (esta aqui): toque na versão no rodapé para ver o que mudou a cada atualização.",
      "Investimentos: coluna Investido ao lado do Valor atual na carteira, e o Dashboard mostra o investido junto do resultado.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-04",
    title: "Seletor de mês e ano",
    items: ["Clique no nome do mês para abrir um calendário e pular direto para qualquer mês e ano."],
  },
  {
    version: "1.0.0",
    date: "2026-08-02",
    title: "Exportação em CSV",
    items: ["Exporte os lançamentos e o extrato de cartão em CSV no Panorama (abre no Excel)."],
  },
  {
    version: "1.0.0",
    date: "2026-08-01",
    title: "Resumo matinal e Panorama mais completo",
    items: [
      "Resumo matinal no Telegram com as contas do dia.",
      "Panorama: totais por ano e opção de ocultar meses já quitados.",
      "Ajustes em como os dividendos entram nas receitas do mês.",
      "Correção na cópia de contas com recorrência semanal.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-31",
    title: "Caixinhas com histórico no mês",
    items: [
      "Depósitos nas caixinhas e contas pagas pela caixinha viram lançamentos no mês — o dinheiro nunca some nem conta duas vezes.",
      "Correções no parcelamento (editar parcela única e compras por foto).",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-30",
    title: "Fatura do Bradesco no app e cartões mais ricos",
    items: [
      "Importação da fatura do cartão Bradesco em PDF.",
      "Tela de Cartões com fatura detalhada e vencimentos.",
      "Bot do Telegram entende foto de comprovante.",
      "Orçamento por categoria e melhorias na visualização do mês.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-25",
    title: "Fatura pelo vencimento e reserva diária",
    items: [
      "Compras de cartão caem no mês do vencimento da fatura, como no banco.",
      "Reserva do dia a dia: um valor por dia que decai sozinho e pesa no que falta pagar.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-20",
    title: "Panorama e atalhos",
    items: [
      "Panorama: todos os meses lado a lado, com edição direto na célula.",
      "Copiar as contas do mesmo mês do ano anterior.",
      "Bot do Telegram entende o SMS de compra do cartão Bradesco.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-19",
    title: "Investimentos",
    items: [
      "Carteira de ações com cotações automáticas diárias, dividendos e importação dos relatórios da B3.",
      "Fechamento diário da carteira no Telegram.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-17",
    title: "Lançamento do Grana",
    items: [
      "Contas do mês com receitas, despesas, categorias e baixa de pagamento.",
      "Reservas (caixinhas), itens fixos e acesso protegido por senha.",
    ],
  },
];
```

Em `package.json`, mude `"version": "1.0.0"` para `"version": "1.1.0"` e atualize o lock:

```bash
npm install --package-lock-only
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/changelog.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/changelog.ts tests/changelog.test.ts package.json package-lock.json
git commit -m "feat: changelog do app e versão 1.1.0"
```

---

### Task 4: Página `/novidades` + rodapés com link

**Files:**
- Create: `app/(app)/novidades/page.tsx`
- Modify: `components/app-shell/Sidebar.tsx` (rodapé vira link)
- Modify: `components/app-shell/Topbar.tsx` (rodapé no Sheet mobile)

**Interfaces:**
- Consumes: `CHANGELOG`, `ChangelogEntry` (Task 3); `Badge`, `Card`, `CardContent` de `@/components/ui`.
- Produces: rota `/novidades` (protegida pelo layout `(app)` como as demais).

- [ ] **Step 1: Criar `app/(app)/novidades/page.tsx`**

```tsx
import { CHANGELOG } from "@/lib/changelog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** "2026-08-04" → "4 de agosto de 2026". */
function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso + "T00:00:00Z"));
}

export default function NovidadesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novidades</h1>
        <p className="text-sm text-muted-foreground">O que mudou no Grana a cada atualização.</p>
      </div>
      <div className="space-y-4">
        {CHANGELOG.map((e) => (
          <Card key={`${e.version}-${e.date}-${e.title}`}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{formatDateLong(e.date)}</span>
                <Badge variant="secondary" className="tabular-nums">
                  v{e.version}
                </Badge>
              </div>
              <p className="font-semibold">{e.title}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {e.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodapé da Sidebar vira link**

Em `components/app-shell/Sidebar.tsx`, substitua o bloco do rodapé (o `<div className="mt-auto border-t p-4 …">` inteiro) por:

```tsx
<Link
  href="/novidades"
  className="mt-auto block border-t p-4 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
>
  <div>Grana · cassolitech</div>
  <div className="tabular-nums">
    v{version}
    {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      ? ` · ${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
      : ""}
  </div>
</Link>
```

(`Link` e `version` já são importados no arquivo.)

- [ ] **Step 3: Rodapé no Sheet do menu mobile**

Em `components/app-shell/Topbar.tsx`:
1. Adicione o import: `import { version } from "@/package.json";`
2. Dentro do `<SheetContent side="left" className="w-64">`, logo APÓS o `</nav>`, adicione (o `SheetContent` é flex-col, então `mt-auto` cola no rodapé):

```tsx
<Link
  href="/novidades"
  onClick={() => setOpen(false)}
  className="mt-auto block border-t px-2 py-3 text-[11px] text-muted-foreground hover:text-foreground"
>
  Grana · cassolitech · <span className="tabular-nums">v{version}</span> — Novidades
</Link>
```

- [ ] **Step 4: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde (lint mantém só os 4 warnings pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/novidades/page.tsx components/app-shell/Sidebar.tsx components/app-shell/Topbar.tsx
git commit -m "feat: página Novidades com a versão do rodapé clicável"
```

---

### Task 5: Investido × Valor atual (carteira + Dashboard)

**Files:**
- Modify: `app/(app)/investimentos/page.tsx` (thead linhas 199–210 e tbody linhas 226–241)
- Modify: `app/(app)/dashboard/page.tsx` (detalhe do card Investimentos, ~linha 205)

**Interfaces:**
- Consumes: `calcPosition` já devolve `costCents: number` (sempre) e `valueCents: number | null` (null sem cotação); `calcPortfolio` já devolve `costCents` no total — nada novo em `lib/`.
- Produces: só UI.

- [ ] **Step 1: Coluna na tabela da carteira**

Em `app/(app)/investimentos/page.tsx`, no `<thead>`, insira a coluna "Investido" após "Cotação" e renomeie "Valor" para "Valor atual":

```tsx
<th className="px-3 py-1.5 font-medium text-muted-foreground">Cotação</th>
<th className="px-3 py-1.5 font-medium text-muted-foreground">Investido</th>
<th className="px-3 py-1.5 font-medium text-muted-foreground">Valor atual</th>
```

No `<tbody>`, após a célula da Cotação, insira a célula do Investido e troque a célula do Valor (que caía no custo sem cotação) por "—":

```tsx
<td className="px-3 py-1.5 tabular-nums">{formatCents(p.costCents)}</td>
<td className="px-3 py-1.5 tabular-nums">
  {p.valueCents !== null ? formatCents(p.valueCents) : <span className="text-muted-foreground">—</span>}
</td>
```

(Os totais dos cards do topo e a alocação NÃO mudam — posição sem cotação continua entrando pelo custo lá, como o aviso "entram pelo custo" documenta.)

- [ ] **Step 2: Investido no card do Dashboard**

Em `app/(app)/dashboard/page.tsx`, no card "Investimentos", o detalhe atual é:

```tsx
{investAssets.length === 0
  ? "Nenhuma posição ainda"
  : `${investAssets.length} ativos · resultado ${formatCents(portfolio.resultCents)} (${formatPct(portfolio.resultPct)})`}
```

Troque a linha do template para incluir o investido:

```tsx
{investAssets.length === 0
  ? "Nenhuma posição ainda"
  : `${investAssets.length} ativos · investido ${formatCents(portfolio.costCents)} · resultado ${formatCents(portfolio.resultCents)} (${formatPct(portfolio.resultPct)})`}
```

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/investimentos/page.tsx app/\(app\)/dashboard/page.tsx
git commit -m "feat: investido ao lado do valor atual na carteira e no Dashboard"
```

---

### Task 6: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7. Se falhar no passo de reset do banco com mensagem vazia, é instabilidade do Supabase — rode `npx tsx scripts/e2e-reset-db.ts` isolado e repita o e2e.

- [ ] **Step 3: verificação visual e funcional (dados reais, somente leitura)**

Suba o app compilado:

```bash
APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3189
```

Com Playwright (script temporário `scripts/_shoot.mjs` DENTRO do projeto, deletado ao final; aguardar animações com `el.getAnimations()` antes de screenshots de popover/expansão). Roteiro em `/mes?month=2026-08` (desktop 1280×800 e mobile 390×844):

1. Cards "Reserva"/"Retirada da reserva" (os que existirem no mês) **recolhidos**: só cabeçalho com contador/total/chevron. Screenshot.
2. Tocar no cabeçalho da "Retirada da reserva" → expande com as linhas; tocar de novo → recolhe. Screenshots.
3. Digitar "alug" na busca → só ALUGUEL visível, categorias vazias somem, stat cards do topo inalterados. Screenshot.
4. Digitar "retirada" → card "Retirada da reserva" aparece **expandido automaticamente**; limpar (✕) → volta recolhido e a lista completa reaparece. Screenshots.
5. Digitar "zzzz" → estado "Nenhuma conta encontrada para “zzzz”." Screenshot.
6. `/novidades`: timeline com v1.1.0 no topo; rodapé da sidebar mostra **v1.1.0** e clicar nele navega para `/novidades`. No mobile, o link fica no rodapé do menu hambúrguer. Screenshots.
7. `/investimentos`: colunas "Investido" e "Valor atual" lado a lado. Screenshot.
8. `/dashboard`: card Investimentos com "investido R$ … · resultado …". Screenshot.
9. Encerrar o servidor e deletar o script temporário.

Anexar screenshots e log das URLs ao relatório.
