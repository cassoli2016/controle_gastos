# Totais por ano e total geral no Panorama — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Panorama ganha uma coluna de total ao fim de cada ano e uma coluna `TOTAL` geral, somando o que ainda falta.

**Architecture:** Três helpers puros em `lib/matrix.ts` (`matrixColumns`, `sumMonths`, `rowRemainingTotal`) descrevem e somam as colunas; a página passa a iterar `columns` em vez de `visibleMonths`, ramificando por `col.kind`. Spec: `docs/superpowers/specs/2026-08-01-panorama-totais-ano-design.md`.

**Tech Stack:** Next.js (App Router, server components), Vitest.

## Global Constraints

- **Tudo soma "o que ainda falta"** (`remainingCents` / `totalsByMonth` / `toPayByMonth` / `toReceiveByMonth`), nunca o previsto cheio.
- **Sem coluna redundante:** ano com um único mês visível não vira coluna; `TOTAL` só quando há 2+ anos.
- **Rótulos:** ano → `2026` (4 dígitos); total → `TOTAL`.
- **Célula vazia:** linha/seção sem nenhum lançamento nos meses da coluna mostra `—` (linha `—` também nas colunas de mês, como hoje); com lançamentos, mostra o valor, inclusive `0,00`.
- Colunas de ano/total são só leitura — `CellAction` continua exclusivo das colunas de mês.
- Somam apenas os meses visíveis (respeitando o filtro de meses quitados).
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Helpers de coluna e soma

**Files:**
- Modify: `lib/matrix.ts` (após `hiddenMonthsSummary`, no fim do arquivo)
- Test: `tests/matrix.test.ts` (novos `describe` ao final)

**Interfaces:**
- Consumes: tipo `MatrixRow` (já exportado, com `cells: Record<string, MatrixCell>` e `MatrixCell.remainingCents: number`).
- Produces (Task 2 consome):
  - `type MatrixColumn = { kind: "month"; monthISO: string } | { kind: "year"; year: string; months: string[] } | { kind: "total"; months: string[] }`
  - `matrixColumns(visibleMonths: string[]): MatrixColumn[]`
  - `sumMonths(byMonth: Record<string, number>, months: string[]): number`
  - `rowRemainingTotal(row: Pick<MatrixRow, "cells">, months: string[]): number`

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/matrix.test.ts` (e inclua `matrixColumns`, `sumMonths`, `rowRemainingTotal` no import existente de `@/lib/matrix`):

```ts
describe("matrixColumns", () => {
  /** Rótulo de cada coluna, para comparar a sequência inteira de uma vez. */
  const seq = (months: string[]) =>
    matrixColumns(months).map((c) => (c.kind === "month" ? c.monthISO : c.kind === "year" ? c.year : "TOTAL"));

  it("lista vazia não gera coluna nenhuma", () => {
    expect(matrixColumns([])).toEqual([]);
  });

  it("dois anos: coluna ao fim de cada ano e total geral no fim", () => {
    expect(seq(["2026-11", "2026-12", "2027-01", "2027-02"])).toEqual([
      "2026-11",
      "2026-12",
      "2026",
      "2027-01",
      "2027-02",
      "2027",
      "TOTAL",
    ]);
  });

  it("cada coluna carrega os meses que soma", () => {
    const cols = matrixColumns(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(cols.find((c) => c.kind === "year" && c.year === "2026")).toMatchObject({
      months: ["2026-11", "2026-12"],
    });
    expect(cols.find((c) => c.kind === "total")).toMatchObject({
      months: ["2026-11", "2026-12", "2027-01", "2027-02"],
    });
  });

  it("um ano só: sem total geral (repetiria a coluna do ano)", () => {
    const cols = matrixColumns(["2026-01", "2026-02"]);
    expect(cols.some((c) => c.kind === "total")).toBe(false);
    expect(cols.filter((c) => c.kind === "year")).toHaveLength(1);
  });

  it("ano com um único mês visível não vira coluna", () => {
    expect(seq(["2026-12", "2027-01", "2027-02"])).toEqual(["2026-12", "2027-01", "2027-02", "2027", "TOTAL"]);
  });

  it("mês único: só a coluna do mês", () => {
    expect(seq(["2026-05"])).toEqual(["2026-05"]);
  });
});

describe("sumMonths", () => {
  const byMonth = { "2026-01": 1000, "2026-02": 500, "2027-01": 250 };

  it("soma só os meses pedidos", () => {
    expect(sumMonths(byMonth, ["2026-01", "2026-02"])).toBe(1500);
  });

  it("mês ausente conta zero", () => {
    expect(sumMonths(byMonth, ["2026-01", "2026-03"])).toBe(1000);
  });

  it("lista vazia soma zero", () => {
    expect(sumMonths(byMonth, [])).toBe(0);
  });
});

describe("rowRemainingTotal", () => {
  const cell = (remainingCents: number) => ({
    cents: remainingCents,
    remainingCents,
    allPaid: remainingCents === 0,
    paidCount: 0,
    count: 1,
    entries: [],
    kind: "item" as const,
  });
  const row = { cells: { "2026-01": cell(1000), "2026-02": cell(0), "2026-03": cell(700) } };

  it("soma o que falta nas células existentes", () => {
    expect(rowRemainingTotal(row, ["2026-01", "2026-02", "2026-03"])).toBe(1700);
  });

  it("mês sem célula não soma", () => {
    expect(rowRemainingTotal(row, ["2026-01", "2026-09"])).toBe(1000);
  });

  it("célula quitada contribui zero", () => {
    expect(rowRemainingTotal(row, ["2026-02"])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/matrix.test.ts`
Expected: FAIL — `matrixColumns`/`sumMonths`/`rowRemainingTotal` não são exportados.

- [ ] **Step 3: Write minimal implementation**

Ao final de `lib/matrix.ts`:

```ts
/** Coluna da matriz: mês real, fechamento de ano ou total geral. */
export type MatrixColumn =
  | { kind: "month"; monthISO: string }
  | { kind: "year"; year: string; months: string[] }
  | { kind: "total"; months: string[] };

/**
 * Colunas a partir dos meses visíveis (ordenados): cada mês, uma coluna ao
 * fim de cada ano e o total geral. Ano com um único mês visível e total geral
 * de um ano só ficam de fora — repetiriam a coluna vizinha.
 */
export function matrixColumns(visibleMonths: string[]): MatrixColumn[] {
  const out: MatrixColumn[] = [];
  const years: string[] = [];
  for (let i = 0; i < visibleMonths.length; i++) {
    const monthISO = visibleMonths[i];
    out.push({ kind: "month", monthISO });
    const year = monthISO.slice(0, 4);
    if (visibleMonths[i + 1]?.slice(0, 4) === year) continue; // ainda não fechou o ano
    years.push(year);
    const months = visibleMonths.filter((m) => m.startsWith(`${year}-`));
    if (months.length > 1) out.push({ kind: "year", year, months });
  }
  if (years.length > 1) out.push({ kind: "total", months: visibleMonths });
  return out;
}

/** Soma um mapa mês→valor nos meses pedidos (chave ausente conta zero). */
export function sumMonths(byMonth: Record<string, number>, months: string[]): number {
  return months.reduce((acc, m) => acc + (byMonth[m] ?? 0), 0);
}

/** Soma o que ainda falta nas células de uma linha, nos meses pedidos. */
export function rowRemainingTotal(row: Pick<MatrixRow, "cells">, months: string[]): number {
  return months.reduce((acc, m) => acc + (row.cells[m]?.remainingCents ?? 0), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/matrix.test.ts`
Expected: PASS (todos, inclusive os 12 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/matrix.ts tests/matrix.test.ts
git commit -m "feat: colunas de ano e total geral na matriz"
```

---

### Task 2: Renderizar as colunas no Panorama

**Files:**
- Modify: `app/(app)/panorama/page.tsx`

**Interfaces:**
- Consumes: `matrixColumns`, `sumMonths`, `rowRemainingTotal`, `type MatrixColumn` (Task 1); `visibleMonths`, `matrix`, `currentMonth` já existem na página.
- Produces: UI final — nada consome depois.

- [ ] **Step 1: Imports e colunas**

1. No import de `@/lib/matrix`, acrescente `matrixColumns`, `sumMonths`, `rowRemainingTotal` e `type MatrixColumn`.
2. Logo após a linha que define `visibleMonths`:

```tsx
  const columns = matrixColumns(visibleMonths);
```

- [ ] **Step 2: Helpers de coluna no topo do arquivo**

Ao lado da função `fmt` (antes do componente da página):

```tsx
/** Fundo da coluna: destaque das derivadas (ano/total) e do mês corrente. */
function colBg(col: MatrixColumn, currentMonth: string): string {
  if (col.kind === "year") return "bg-muted/40 font-medium";
  if (col.kind === "total") return "bg-muted/60 font-semibold";
  return col.monthISO === currentMonth ? "bg-primary/5" : "";
}

/** Chave estável de React por coluna. */
function colKey(col: MatrixColumn): string {
  return col.kind === "month" ? col.monthISO : col.kind === "year" ? `year-${col.year}` : "total";
}
```

- [ ] **Step 3: Cabeçalho**

Troque `{visibleMonths.map(monthTh)}` no `<thead>` por:

```tsx
                    {columns.map((col) =>
                      col.kind === "month" ? (
                        monthTh(col.monthISO)
                      ) : (
                        <th
                          key={colKey(col)}
                          className={`whitespace-nowrap px-3 py-2 text-right font-medium ${colBg(col, currentMonth)}`}
                        >
                          {col.kind === "year" ? col.year : "TOTAL"}
                        </th>
                      ),
                    )}
```

- [ ] **Step 4: Rodapé (as três linhas)**

Troque a linha "A receber":

```tsx
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? col.monthISO in matrix.toReceiveByMonth
                            ? matrix.toReceiveByMonth[col.monthISO]
                            : null
                          : sumMonths(matrix.toReceiveByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 ${colBg(col, currentMonth)}`}
                        >
                          {v === null ? "—" : fmt(v)}
                        </td>
                      );
                    })}
```

A linha "A pagar" fica igual, trocando `toReceiveByMonth` por `toPayByMonth` e as classes `emerald` por `rose`:

```tsx
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? col.monthISO in matrix.toPayByMonth
                            ? matrix.toPayByMonth[col.monthISO]
                            : null
                          : sumMonths(matrix.toPayByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400 ${colBg(col, currentMonth)}`}
                        >
                          {v === null ? "—" : fmt(v)}
                        </td>
                      );
                    })}
```

E a linha "Saldo a realizar":

```tsx
                    {columns.map((col) => {
                      const v =
                        col.kind === "month"
                          ? matrix.balanceByMonth[col.monthISO] ?? 0
                          : sumMonths(matrix.toReceiveByMonth, col.months) - sumMonths(matrix.toPayByMonth, col.months);
                      return (
                        <td
                          key={colKey(col)}
                          className={`px-3 py-2 text-right tabular-nums ${
                            v < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          } ${colBg(col, currentMonth)}`}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
```

- [ ] **Step 5: `SectionRows` passa a receber colunas**

Troque a chamada no `<tbody>`:

```tsx
                    <SectionRows key={section.categoryName} section={section} columns={columns} currentMonth={currentMonth} />
```

E no componente, troque a prop `months: string[]` por `columns: MatrixColumn[]` (tipo e destructuring). A linha de subtotal da categoria vira:

```tsx
        {columns.map((col) => {
          const has =
            col.kind === "month"
              ? col.monthISO in section.totalsByMonth
              : col.months.some((m) => m in section.totalsByMonth);
          const v =
            col.kind === "month"
              ? section.totalsByMonth[col.monthISO]
              : sumMonths(section.totalsByMonth, col.months);
          return (
            <td
              key={colKey(col)}
              className={`px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground ${colBg(col, currentMonth)}`}
            >
              {has ? fmt(v) : ""}
            </td>
          );
        })}
```

E as células das linhas viram:

```tsx
          {columns.map((col) => {
            if (col.kind !== "month") {
              const has = col.months.some((m) => m in row.cells);
              return (
                <td key={colKey(col)} className={`px-3 py-1.5 text-right tabular-nums ${colBg(col, currentMonth)}`}>
                  {has ? fmt(rowRemainingTotal(row, col.months)) : <span className="text-muted-foreground/40">—</span>}
                </td>
              );
            }
            const m = col.monthISO;
            const cell = row.cells[m];
            return (
              <td key={m} className={`px-2 py-0.5 text-right tabular-nums ${m === currentMonth ? "bg-primary/5" : ""}`}>
                {cell ? (
                  <CellAction
                    cents={cell.cents}
                    remainingCents={cell.remainingCents}
                    allPaid={cell.allPaid}
                    paidCount={cell.paidCount}
                    count={cell.count}
                    entries={cell.entries}
                    kind={cell.kind}
                    income={section.categoryType === "INCOME"}
                    monthLabel={shortMonthLabel(m)}
                    line={row.line}
                  />
                ) : (
                  <span className="px-1 text-muted-foreground/40">—</span>
                )}
              </td>
            );
          })}
```

- [ ] **Step 6: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes em outros arquivos).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/panorama/page.tsx"
git commit -m "feat: colunas de total por ano e total geral no Panorama"
```

---

### Task 3: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7 (nenhum teste toca o Panorama; o gate é regressão geral).

- [ ] **Step 3: verificação visual (dados reais, somente leitura)**

Suba o app compilado numa porta livre e tire screenshot do Panorama:

```bash
APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3194
```

Com Playwright: login em `/login` (`input[name="password"]`, botão `Entrar`), depois `/panorama`, screenshot com `fullPage: false` e viewport largo (ex.: 1900×1000) e outro com scroll horizontal até o fim da tabela.

**Confira aritmeticamente, não só visualmente:** para uma linha qualquer com valores em vários meses de um ano, a coluna do ano deve ser a soma das células daquele ano; a coluna `TOTAL` deve ser a soma de todas as colunas de ano (mais os meses de anos sem coluna própria). Confirme também que a linha "A pagar" segue essa mesma relação. Encerre o servidor ao final e anexe os screenshots ao relatório.
