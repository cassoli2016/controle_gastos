# Panorama pelo que falta + Reserva do dia a dia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Panorama passa a mostrar o que ainda falta pagar/receber (célula, subtotal e rodapé), e um indicador novo mostra a reserva do dia a dia caindo R$ X por dia que passa.

**Architecture:** Duas partes independentes. (1) `lib/matrix.ts` deriva `remainingCents` de `paid`+`cents` — ocorrência paga contribui zero — e a UI do Panorama passa a exibir esse número, guardando o previsto no popover. (2) Uma tabela de linha única (`DailyBudget.amountPerDay`) alimenta uma função pura `dailyBudget(month, todayISO, perDayCents)` que devolve dias restantes e valor restante; três telas exibem o resultado num `StatCard`.

**Tech Stack:** Next.js 16.2.10 (App Router, Server Actions), React 19.2, Prisma 7.8 + Postgres (driver adapter `@prisma/adapter-pg`), Zod 4, Tailwind 4 + shadcn/ui, Vitest 4 (unit), Playwright (e2e).

## Global Constraints

- **Leia o guia do Next em `node_modules/next/dist/docs/` antes de escrever código que toque APIs do framework** (`AGENTS.md`: esta versão do Next tem breaking changes em relação ao conhecimento pré-treinado).
- Dinheiro em **centavos inteiros** no domínio; `Decimal` do Prisma sempre convertido com `decimalToCents(String(valor))` e escrito com `centsToNumber(cents)` (`lib/money.ts`). Nenhuma aritmética de dinheiro em float.
- Meses são strings `"YYYY-MM"`; datas de dia são `"YYYY-MM-DD"`. Aritmética de data em UTC (`Date.UTC`) e via os helpers de `lib/dates.ts`. "Hoje" vem sempre de `todayISOInSaoPaulo()` (`lib/fatura.ts`), nunca do fuso do servidor.
- Comentários e textos de UI em **português do Brasil**, com acentuação correta. Comentários explicam o *porquê*, não o *quê* — siga a densidade dos arquivos vizinhos.
- Server Actions retornam `ActionState` (`{ error?, ok?, count? }`), são consumidas via `useActionState` + `useActionToast`, e chamam `revalidateFinance()` (`lib/revalidate.ts`) em vez de listar caminhos.
- Nada de `useEffect` para fechar dialog/popover: o padrão do projeto é ajustar estado durante a renderização.
- Tailwind com tema claro/escuro: cor sempre no par `text-X-600 dark:text-X-400`.
- **Regra de negócio central da parte 1:** `restante = paga ? 0 : previsto` por ocorrência. Pagamento com valor diferente do previsto **não** deixa resto.
- **Regra de negócio central da parte 2:** dias restantes = mês futuro → todos os dias do mês; mês corrente → `dias do mês − dia de hoje + 1` (hoje conta); mês passado → 0.
- A reserva do dia a dia é **meta**, não despesa: não entra no Saldo do mês nem no "Total guardado" das caixinhas.
- Não editar arquivos em `prisma/migrations/**` que já existam — migration aplicada tem checksum registrado no banco.

---

### Task 1: `remainingCents` na matriz do Panorama

**Files:**
- Modify: `lib/matrix.ts:20-50` (tipos), `:52-103` (`buildMatrix`)
- Test: `tests/matrix.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `MatrixCell` ganha `remainingCents: number` (o que falta na célula; `cents` continua sendo o previsto).
  - `Matrix.incomeByMonth`/`expenseByMonth` são **renomeados** para `toReceiveByMonth`/`toPayByMonth` e passam a somar o restante.
  - `Matrix.balanceByMonth` mantém o nome; passa a ser `toReceive − toPay`.
  - `MatrixSection.totalsByMonth` passa a somar o restante.
  - `MatrixRow.totalCents` continua somando o **previsto**.

- [ ] **Step 1: Ajuste os testes existentes que mudam de nome e de valor**

Em `tests/matrix.test.ts`, o teste "totais por mês (receita, despesa, saldo)" usa os nomes e valores antigos. A fixture tem `Diarista` com duas ocorrências de 22000, das quais **e4 está paga**. Substitua aquele `it` inteiro por:

```ts
  it("totais por mês somam o que falta (receita, despesa, saldo)", () => {
    // Gobrax não recebido: falta tudo.
    expect(m.toReceiveByMonth["2026-08"]).toBe(2500000);
    // Nubank 1.400.000 em aberto + 1 das 2 diaristas (22.000) — a outra está paga.
    expect(m.toPayByMonth["2026-08"]).toBe(1422000);
    expect(m.balanceByMonth["2026-08"]).toBe(1078000);
    expect(m.balanceByMonth["2026-09"]).toBe(-660000);
  });
```

E o teste "subtotais da seção por mês" continua válido para `Cartão/Compras` (nada pago ali), mas acrescente logo depois dele:

```ts
  it("subtotal da seção soma o que falta, não o previsto", () => {
    const moradia = m.sections.find((s) => s.categoryName === "Moradia")!;
    // 2 diaristas de 22.000, uma paga → falta 22.000 (o previsto é 44.000).
    expect(moradia.totalsByMonth).toEqual({ "2026-08": 22000 });
  });
```

- [ ] **Step 2: Escreva os testes novos de `remainingCents`**

Acrescente ao fim do `describe("buildMatrix")`:

```ts
  it("célula parcial: remainingCents é só o que falta, cents segue sendo o previsto", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toMatchObject({ cents: 44000, remainingCents: 22000 });
  });

  it("nenhuma paga: remainingCents igual ao previsto", () => {
    const nubank = m.sections.find((s) => s.categoryName === "Cartão/Compras")!.rows[0];
    expect(nubank.cells["2026-08"]).toMatchObject({ cents: 1400000, remainingCents: 1400000 });
  });

  it("linha da matriz continua somando o previsto, não o restante", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.totalCents).toBe(44000);
  });

  it("mês todo quitado: chave existe com zero (o rodapé precisa distinguir de mês vazio)", () => {
    const quitado = buildMatrix([
      { line: "Luz", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 18000, paid: true, entryId: "q1", kind: "item" as const },
      { line: "Salário", categoryName: "Recebimentos", categoryType: "INCOME" as const, monthISO: "2026-08", cents: 900000, paid: true, entryId: "q2", kind: "item" as const },
    ]);
    expect(quitado.sections.find((s) => s.categoryName === "Moradia")!.rows[0].cells["2026-08"]).toMatchObject({
      cents: 18000,
      remainingCents: 0,
      allPaid: true,
    });
    expect("2026-08" in quitado.toPayByMonth).toBe(true);
    expect(quitado.toPayByMonth["2026-08"]).toBe(0);
    expect("2026-08" in quitado.toReceiveByMonth).toBe(true);
    expect(quitado.toReceiveByMonth["2026-08"]).toBe(0);
    expect(quitado.balanceByMonth["2026-08"]).toBe(0);
    expect("2026-08" in quitado.sections.find((s) => s.categoryName === "Moradia")!.totalsByMonth).toBe(true);
  });

  it("pagamento menor que o previsto não deixa resto", () => {
    // Conta de 200 baixada com 180 está quitada — a diferença é só o que ela
    // custou a menos, não um resto a pagar.
    const menor = buildMatrix([
      { line: "Água", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 20000, paid: true, entryId: "a1", kind: "item" as const },
    ]);
    expect(menor.toPayByMonth["2026-08"]).toBe(0);
  });
```

- [ ] **Step 3: Rode os testes e confirme que falham**

Run: `npx vitest run tests/matrix.test.ts`
Expected: FAIL — `toReceiveByMonth`/`toPayByMonth` são `undefined`, `remainingCents` é `undefined`, e os subtotais ainda somam o previsto.

- [ ] **Step 4: Atualize os tipos**

Em `lib/matrix.ts`, substitua os blocos de tipo (linhas 20-50) por:

```ts
export type MatrixCell = {
  /** Previsto somado das ocorrências — o que a conta custa no mês. */
  cents: number;
  /**
   * O que ainda falta pagar/receber na célula: ocorrência paga contribui zero.
   * É o número exibido na matriz; `cents` fica para o popover.
   */
  remainingCents: number;
  /** Todas as ocorrências da célula pagas (semanais somam várias). */
  allPaid: boolean;
  /** Quantas das `count` ocorrências estão pagas — baixa parcial da célula. */
  paidCount: number;
  count: number;
  entries: { id: string; cents: number; paid: boolean }[];
  kind: "item" | "card" | "loose";
};

export type MatrixRow = {
  line: string;
  cells: Record<string, MatrixCell>;
  /** Soma dos PREVISTOS da linha em todos os meses — não é o restante. */
  totalCents: number;
};

export type MatrixSection = {
  categoryName: string;
  categoryType: "INCOME" | "EXPENSE";
  rows: MatrixRow[];
  /** O que ainda falta na categoria, por mês — mesma leitura das células. */
  totalsByMonth: Record<string, number>;
};

export type Matrix = {
  months: string[];
  sections: MatrixSection[];
  /** O que ainda falta receber, por mês. */
  toReceiveByMonth: Record<string, number>;
  /** O que ainda falta pagar, por mês. */
  toPayByMonth: Record<string, number>;
  /** `toReceive − toPay`: o quanto o mês ainda mexe no bolso daqui pra frente. */
  balanceByMonth: Record<string, number>;
};
```

- [ ] **Step 5: Acumule o restante em `buildMatrix`**

Substitua o corpo de `buildMatrix` (linhas 52-103) por:

```ts
export function buildMatrix(entries: MatrixEntry[]): Matrix {
  const months = [...new Set(entries.map((e) => e.monthISO))].sort();

  type SectionAcc = { categoryType: "INCOME" | "EXPENSE"; rows: Map<string, MatrixRow>; totalsByMonth: Record<string, number> };
  const sections = new Map<string, SectionAcc>();
  const toReceiveByMonth: Record<string, number> = {};
  const toPayByMonth: Record<string, number> = {};

  for (const e of entries) {
    // Ocorrência paga não deixa resto: uma conta de R$ 200 baixada com R$ 180
    // está quitada, e a diferença é só o que ela custou a menos.
    const remaining = e.paid ? 0 : e.cents;

    const sec = sections.get(e.categoryName) ?? {
      categoryType: e.categoryType,
      rows: new Map<string, MatrixRow>(),
      totalsByMonth: {},
    };
    const row = sec.rows.get(e.line) ?? { line: e.line, cells: {}, totalCents: 0 };
    const cell =
      row.cells[e.monthISO] ??
      { cents: 0, remainingCents: 0, allPaid: true, paidCount: 0, count: 0, entries: [], kind: e.kind };
    cell.cents += e.cents;
    cell.remainingCents += remaining;
    cell.allPaid = cell.allPaid && e.paid;
    if (e.paid) cell.paidCount += 1;
    cell.count += 1;
    cell.entries.push({ id: e.entryId, cents: e.cents, paid: e.paid });
    if (e.kind === "card") cell.kind = "card";
    row.cells[e.monthISO] = cell;
    row.totalCents += e.cents;
    sec.rows.set(e.line, row);
    // A CHAVE é criada mesmo com restante zero: a UI distingue "mês quitado"
    // (mostra 0,00) de "mês sem lançamento" (mostra vazio) pela existência da
    // chave, não pelo valor.
    sec.totalsByMonth[e.monthISO] = (sec.totalsByMonth[e.monthISO] ?? 0) + remaining;
    sections.set(e.categoryName, sec);

    const bucket = e.categoryType === "INCOME" ? toReceiveByMonth : toPayByMonth;
    bucket[e.monthISO] = (bucket[e.monthISO] ?? 0) + remaining;
  }

  const balanceByMonth: Record<string, number> = {};
  for (const m of months) {
    balanceByMonth[m] = (toReceiveByMonth[m] ?? 0) - (toPayByMonth[m] ?? 0);
  }

  const orderedSections: MatrixSection[] = [...sections.entries()]
    .map(([categoryName, s]) => ({
      categoryName,
      categoryType: s.categoryType,
      rows: [...s.rows.values()].sort((a, b) => a.line.localeCompare(b.line, "pt-BR")),
      totalsByMonth: s.totalsByMonth,
    }))
    .sort((a, b) => {
      if (a.categoryType !== b.categoryType) return a.categoryType === "INCOME" ? -1 : 1;
      return a.categoryName.localeCompare(b.categoryName, "pt-BR");
    });

  return { months, sections: orderedSections, toReceiveByMonth, toPayByMonth, balanceByMonth };
}
```

Atualize também o comentário de cabeçalho do arquivo (linhas 1-4) para dizer o que a matriz mostra agora:

```ts
/**
 * Visão Panorama (estilo planilha): matriz linhas (contas) × colunas (meses),
 * com seções por categoria e totais por mês — espelho da planilha original do
 * usuário. Os valores exibidos são o que ainda FALTA pagar/receber: ocorrência
 * paga contribui zero, então a coluna do mês encolhe conforme as contas são
 * quitadas. O previsto continua disponível em `MatrixCell.cents`.
 */
```

- [ ] **Step 6: Rode os testes e confirme que passam**

Run: `npx vitest run tests/matrix.test.ts`
Expected: PASS. `npx tsc --noEmit` vai falhar em `app/(app)/panorama/page.tsx` (usa os nomes antigos) — isso é esperado e é o trabalho da Task 2.

- [ ] **Step 7: Commit**

```bash
git add lib/matrix.ts tests/matrix.test.ts
git commit -m "feat: matriz do Panorama calcula o que ainda falta por célula"
```

---

### Task 2: Panorama exibe o que falta

**Files:**
- Modify: `app/(app)/panorama/page.tsx:56-58` (texto de ajuda), `:86-119` (rodapé), `:150-158` (subtotal da seção), `:166-177` (props da célula)
- Modify: `app/(app)/panorama/CellAction.tsx:17-63` (props e derivações), `:65-97` (botão e resumo do popover)

**Interfaces:**
- Consumes: `MatrixCell.remainingCents`, `Matrix.toReceiveByMonth`, `Matrix.toPayByMonth`, `Matrix.balanceByMonth`, `MatrixSection.totalsByMonth` (Task 1).
- Produces: `CellAction` passa a exigir a prop `remainingCents: number`.

- [ ] **Step 1: Texto de ajuda**

Em `app/(app)/panorama/page.tsx`, troque o `<p>` de ajuda por:

```tsx
        <p className="text-sm text-muted-foreground">
          Todos os meses lado a lado · valores = o que ainda falta · verde = quitado · âmbar = parcial ·
          clique no valor para editar ou dar baixa
        </p>
```

- [ ] **Step 2: Rodapé com os rótulos novos e zero explícito**

No `<tfoot>`, troque as três linhas. O rótulo `Receitas` vira `A receber`, `Despesas` vira `A pagar`, `Saldo` vira `Saldo a realizar` — e o teste de existência passa a ser `m in ...` em vez de truthiness, senão um mês quitado mostraria `—` no lugar de `0,00`:

```tsx
                <tfoot className="border-t-2 font-semibold">
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-emerald-600 dark:text-emerald-400">
                      A receber
                    </td>
                    {matrix.months.map((m) => (
                      <td key={m} className={`px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 ${m === currentMonth ? "bg-primary/5" : ""}`}>
                        {m in matrix.toReceiveByMonth ? fmt(matrix.toReceiveByMonth[m]) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 text-rose-600 dark:text-rose-400">A pagar</td>
                    {matrix.months.map((m) => (
                      <td key={m} className={`px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400 ${m === currentMonth ? "bg-primary/5" : ""}`}>
                        {m in matrix.toPayByMonth ? fmt(matrix.toPayByMonth[m]) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">Saldo a realizar</td>
                    {matrix.months.map((m) => {
                      const v = matrix.balanceByMonth[m] ?? 0;
                      return (
                        <td
                          key={m}
                          className={`px-3 py-2 text-right tabular-nums ${
                            v < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          } ${m === currentMonth ? "bg-primary/5" : ""}`}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
```

- [ ] **Step 3: Subtotal da seção com zero explícito**

Na `SectionRows`, troque a célula de subtotal:

```tsx
          <td
            key={m}
            className={`px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground ${m === currentMonth ? "bg-primary/5" : ""}`}
          >
            {m in section.totalsByMonth ? fmt(section.totalsByMonth[m]) : ""}
          </td>
```

- [ ] **Step 4: Passe `remainingCents` para a célula**

No `<CellAction ... />`, acrescente a prop depois de `cents={cell.cents}`:

```tsx
                    remainingCents={cell.remainingCents}
```

- [ ] **Step 5: `CellAction` exibe o restante e guarda o previsto**

Em `app/(app)/panorama/CellAction.tsx`, acrescente `remainingCents` à desestruturação (depois de `cents`) e ao tipo:

```tsx
  /** O que ainda falta na célula — é o valor exibido na matriz. */
  remainingCents: number;
```

Troque o `<button>` do `PopoverTrigger` inteiro por (o valor exibido passa a ser o restante; o `title` no hover mostra o previsto, que saiu da célula):

```tsx
        <button
          type="button"
          className={`w-full rounded px-1 py-0.5 text-right tabular-nums hover:bg-accent hover:text-foreground ${
            allPaid
              ? "text-emerald-600 dark:text-emerald-400"
              : partial
                ? "text-amber-600 dark:text-amber-400"
                : ""
          }`}
          title={
            allPaid
              ? `Quitado · previsto ${formatCents(cents)}`
              : partial
                ? `Falta ${formatCents(remainingCents)} de ${formatCents(cents)}${count > 1 ? ` · ${paidCount} de ${count} pagas` : ""}`
                : count > 1
                  ? `${count} ocorrências`
                  : undefined
          }
        >
          {fmt(remainingCents)}
          {partial && count > 1 && (
            <span className="ml-0.5 align-super text-[9px] tabular-nums opacity-70">
              {paidCount}/{count}
            </span>
          )}
        </button>
```

E troque a linha de resumo do popover por:

```tsx
            <p className="text-xs text-muted-foreground">
              {monthLabel} ·{" "}
              {allPaid
                ? `${income ? "recebido" : "pago"} · ${formatCents(cents)}`
                : partial
                  ? `falta ${formatCents(remainingCents)} de ${formatCents(cents)}`
                  : formatCents(cents)}
              {count > 1 && ` · ${count} ocorrências`}
              {partial && ` · ${paidCount} ${income ? "recebidas" : "pagas"}`}
            </p>
```

**Não mexa** no `CurrencyInput` do formulário de edição: ele continua com `defaultCents={cents}`, porque o que se edita é o **previsto**, não o restante.

- [ ] **Step 6: Verifique tipos e lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros de tipo (os nomes antigos `incomeByMonth`/`expenseByMonth` não existem mais em lugar nenhum), lint sem erros novos, testes passando.

Run: `grep -rn "incomeByMonth\|expenseByMonth" app lib tests --include="*.ts" --include="*.tsx"`
Expected: nenhuma saída.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/panorama/page.tsx app/\(app\)/panorama/CellAction.tsx
git commit -m "feat: Panorama mostra o que falta pagar e receber"
```

---

### Task 3: Cálculo da reserva do dia a dia (função pura)

**Files:**
- Create: `lib/daily-budget.ts`
- Test: `tests/daily-budget.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `daysInMonth(month: string): number`
  - `type DailyBudgetView = { perDayCents: number; daysInMonth: number; daysRemaining: number; monthTotalCents: number; remainingCents: number }`
  - `dailyBudget(month: string, todayISO: string, perDayCents: number): DailyBudgetView`

- [ ] **Step 1: Escreva os testes que falham**

`tests/daily-budget.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dailyBudget, daysInMonth } from "@/lib/daily-budget";

const CEM = 10000; // R$ 100,00 por dia, em centavos

describe("daysInMonth", () => {
  it("meses de 31, 30 e 28 dias", () => {
    expect(daysInMonth("2026-07")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
    expect(daysInMonth("2027-02")).toBe(28);
  });
  it("fevereiro de ano bissexto", () => {
    expect(daysInMonth("2028-02")).toBe(29);
  });
});

describe("dailyBudget no mês corrente", () => {
  it("primeiro dia reserva o mês cheio", () => {
    expect(dailyBudget("2026-07", "2026-07-01", CEM)).toMatchObject({
      daysInMonth: 31,
      daysRemaining: 31,
      monthTotalCents: 310000,
      remainingCents: 310000,
    });
  });
  it("dia 26 de um mês de 31 dias deixa 6 dias (hoje conta)", () => {
    expect(dailyBudget("2026-07", "2026-07-26", CEM)).toMatchObject({
      daysRemaining: 6,
      remainingCents: 60000,
    });
  });
  it("último dia do mês deixa exatamente um dia", () => {
    expect(dailyBudget("2026-07", "2026-07-31", CEM)).toMatchObject({
      daysRemaining: 1,
      remainingCents: 10000,
    });
  });
  it("fevereiro bissexto no dia 1", () => {
    expect(dailyBudget("2028-02", "2028-02-01", CEM)).toMatchObject({
      daysInMonth: 29,
      daysRemaining: 29,
      remainingCents: 290000,
    });
  });
});

describe("dailyBudget em outros meses", () => {
  it("mês futuro reserva o mês cheio (nada consumido)", () => {
    expect(dailyBudget("2026-08", "2026-07-26", CEM)).toMatchObject({
      daysInMonth: 31,
      daysRemaining: 31,
      remainingCents: 310000,
    });
  });
  it("mês futuro do ano seguinte", () => {
    expect(dailyBudget("2027-01", "2026-12-31", CEM)).toMatchObject({
      daysRemaining: 31,
      remainingCents: 310000,
    });
  });
  it("mês passado não deixa nada", () => {
    expect(dailyBudget("2026-06", "2026-07-26", CEM)).toMatchObject({
      daysInMonth: 30,
      daysRemaining: 0,
      monthTotalCents: 300000,
      remainingCents: 0,
    });
  });
  it("mês passado do ano anterior", () => {
    expect(dailyBudget("2026-12", "2027-01-05", CEM)).toMatchObject({
      daysRemaining: 0,
      remainingCents: 0,
    });
  });
});

describe("dailyBudget com outro valor por dia", () => {
  it("o valor por dia é respeitado e devolvido", () => {
    expect(dailyBudget("2026-04", "2026-04-10", 5050)).toMatchObject({
      perDayCents: 5050,
      daysInMonth: 30,
      daysRemaining: 21,
      monthTotalCents: 151500,
      remainingCents: 106050,
    });
  });
});
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `npx vitest run tests/daily-budget.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/daily-budget"`.

- [ ] **Step 3: Implemente o módulo**

`lib/daily-budget.ts`:

```ts
/**
 * Reserva do dia a dia: o mês reserva um valor por dia (R$ 100/dia = R$ 3.100
 * num mês de 31 dias) e o que resta cai a cada dia que passa.
 *
 * É uma META de gasto variável (mercado, combustível, lanches), não uma
 * despesa: os gastos reais entram pela fatura do cartão, então este valor
 * nunca soma no saldo do mês — somar contaria o mesmo dinheiro duas vezes.
 */

export type DailyBudgetView = {
  perDayCents: number;
  daysInMonth: number;
  /** Dias que ainda podem ser gastos, incluindo hoje. */
  daysRemaining: number;
  /** `perDayCents × daysInMonth`. */
  monthTotalCents: number;
  /** `perDayCents × daysRemaining`. */
  remainingCents: number;
};

/** Dias do mês "YYYY-MM" (28/29/30/31). Dia 0 do mês seguinte = último deste. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Reserva do mês `month` vista em `todayISO`. Mês futuro está intocado; mês
 * passado não deixa nada; no mês corrente HOJE ainda conta, porque o dia de
 * hoje pode ser gasto — é o que faz o dia 1 de um mês de 31 dias valer o mês
 * cheio.
 */
export function dailyBudget(month: string, todayISO: string, perDayCents: number): DailyBudgetView {
  const total = daysInMonth(month);
  const todayMonth = todayISO.slice(0, 7);
  // "YYYY-MM" compara lexicograficamente na ordem cronológica.
  const daysRemaining =
    month > todayMonth
      ? total
      : month < todayMonth
        ? 0
        : Math.max(0, total - Number(todayISO.slice(8, 10)) + 1);
  return {
    perDayCents,
    daysInMonth: total,
    daysRemaining,
    monthTotalCents: perDayCents * total,
    remainingCents: perDayCents * daysRemaining,
  };
}
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `npx vitest run tests/daily-budget.test.ts`
Expected: PASS (12 casos).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-budget.ts tests/daily-budget.test.ts
git commit -m "feat: cálculo da reserva do dia a dia"
```

---

### Task 4: Persistência do valor por dia

**Files:**
- Modify: `prisma/schema.prisma` (novo model no fim do bloco de domínio financeiro, antes do bloco `============ INVESTIMENTOS`)
- Create: `prisma/migrations/<timestamp>_daily_budget/migration.sql`
- Modify: `lib/validators.ts` (novo schema depois de `reserveSchema`)
- Modify: `lib/planning.ts` (nova função depois de `getReserves`)
- Modify: `app/(app)/reservas/actions.ts` (nova action)
- Test: `tests/validators.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `dailyBudgetSchema` (Zod) validando `{ amountPerDay: number }` positivo.
  - `getDailyBudget(): Promise<{ perDayCents: number } | null>` em `lib/planning.ts` (null = não configurado).
  - `setDailyBudget(prevState: ActionState, formData: FormData): Promise<ActionState>` em `app/(app)/reservas/actions.ts`, lendo o campo `amountPerDay`.

- [ ] **Step 1: Escreva o teste do validador**

Em `tests/validators.test.ts`, acrescente ao fim do arquivo (ajuste o import do topo para incluir `dailyBudgetSchema`):

```ts
describe("dailyBudgetSchema", () => {
  it("aceita valor positivo", () => {
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "100" }).success).toBe(true);
    expect(dailyBudgetSchema.safeParse({ amountPerDay: 50.5 }).success).toBe(true);
  });
  it("rejeita zero e negativo", () => {
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "0" }).success).toBe(false);
    expect(dailyBudgetSchema.safeParse({ amountPerDay: "-10" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npx vitest run tests/validators.test.ts`
Expected: FAIL — `dailyBudgetSchema` não existe.

- [ ] **Step 3: Adicione o schema Zod**

Em `lib/validators.ts`, depois de `reserveSchema`:

```ts
// Reserva do dia a dia: só o valor por dia é configurável — o total do mês e o
// que resta são derivados do calendário (lib/daily-budget.ts).
export const dailyBudgetSchema = z.object({
  amountPerDay: z.coerce.number().positive("Valor por dia deve ser maior que zero"),
});
```

- [ ] **Step 4: Rode o teste e confirme que passa**

Run: `npx vitest run tests/validators.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicione o model ao schema do Prisma**

Em `prisma/schema.prisma`, logo depois do model `ReserveBox` e antes do comentário `// ============ INVESTIMENTOS`:

```prisma
// Reserva do dia a dia: teto diário de gasto variável (mercado, combustível,
// lanches). O mês reserva amountPerDay × dias do mês e o que resta cai
// amountPerDay por dia que passa. É META, não despesa — os gastos reais entram
// pela fatura do cartão. Linha única (id "default").
model DailyBudget {
  id           String   @id @default("default")
  amountPerDay Decimal  @db.Decimal(12, 2)
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 6: Gere a migration sem aplicar e acrescente o valor inicial**

Run: `npx prisma migrate dev --create-only --name daily_budget`

Abra o `migration.sql` gerado e acrescente ao fim:

```sql
-- Valor informado pelo usuário: R$ 100,00 por dia. Vai como dado (não como
-- constante no código) para ele poder mudar pela tela sem deploy.
INSERT INTO "DailyBudget" ("id", "amountPerDay", "updatedAt")
VALUES ('default', 100, NOW())
ON CONFLICT ("id") DO NOTHING;
```

- [ ] **Step 7: Aplique a migration**

> A `DIRECT_URL` do `.env` aponta para o banco real — esta migration roda em produção, como as 17 anteriores do projeto. Não use `migrate reset` nem `db push`.

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema` e o client regenerado.

- [ ] **Step 8: Confirme o valor gravado**

Crie `scripts/_check-budget.ts`:

```ts
// TEMPORÁRIO — deletar depois de conferir. Não commitar.
import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const row = await prisma.dailyBudget.findFirst();
  console.log(row ? `reserva: R$ ${row.amountPerDay} por dia` : "nenhuma linha");
  await prisma.$disconnect();
}
main();
```

Run: `npx tsx scripts/_check-budget.ts && rm scripts/_check-budget.ts`
Expected: `reserva: R$ 100 por dia`

- [ ] **Step 9: Leitura e escrita**

Em `lib/planning.ts`, depois de `getReserves`:

```ts
/** Valor por dia da reserva do dia a dia; null = ainda não configurado. */
export async function getDailyBudget(): Promise<{ perDayCents: number } | null> {
  const row = await prisma.dailyBudget.findFirst();
  if (!row) return null;
  return { perDayCents: decimalToCents(String(row.amountPerDay)) };
}
```

Em `app/(app)/reservas/actions.ts`, acrescente `dailyBudgetSchema` ao import de `@/lib/validators` e a action ao fim do arquivo:

```ts
/** Define o valor por dia da reserva do dia a dia (linha única "default"). */
export async function setDailyBudget(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = dailyBudgetSchema.safeParse({ amountPerDay: formData.get("amountPerDay") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.dailyBudget.upsert({
    where: { id: "default" },
    create: { id: "default", amountPerDay: parsed.data.amountPerDay },
    update: { amountPerDay: parsed.data.amountPerDay },
  });
  revalidateFinance();
  return { ok: true };
}
```

- [ ] **Step 10: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/validators.ts lib/planning.ts app/\(app\)/reservas/actions.ts tests/validators.test.ts
git commit -m "feat: valor por dia da reserva do dia a dia"
```

---

### Task 5: A reserva nas telas

**Files:**
- Modify: `components/StatCard.tsx:24-54` (prop `hint`)
- Create: `app/(app)/reservas/DailyBudgetCard.tsx`
- Modify: `app/(app)/reservas/page.tsx:9-30`
- Modify: `app/(app)/mes/page.tsx:174-183` (query), `:245-251` (grade de StatCards)
- Modify: `app/(app)/dashboard/page.tsx:40-45` (query), `:91-96` (grade de StatCards)

**Interfaces:**
- Consumes: `dailyBudget(month, todayISO, perDayCents)` e `DailyBudgetView` (Task 3); `getDailyBudget()` e `setDailyBudget` (Task 4).
- Produces: `StatCard` ganha a prop opcional `hint?: string`.

- [ ] **Step 1: `StatCard` com linha de detalhe**

Em `components/StatCard.tsx`, troque a assinatura e o corpo do componente por:

```tsx
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  /** Linha de detalhe abaixo do valor (ex.: "6 de 31 dias · R$ 100,00/dia"). */
  hint?: string;
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
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
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {label}
          </div>
          {/* text-base no mobile: "R$ 25.000,00" cabe inteiro num card de meia largura */}
          <div className={cn("truncate text-base font-bold tabular-nums md:text-xl", t.value)}>{value}</div>
          {hint && <div className="truncate text-[10px] text-muted-foreground md:text-[11px]">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Card da reserva na tela Mês**

Em `app/(app)/mes/page.tsx`:

A linha 1 já importa ícones de `lucide-react` (`Inbox, TrendingUp, TrendingDown, Wallet, Clock`) — acrescente `PiggyBank` **àquela lista**, sem criar um import novo. Depois acrescente os três imports que faltam:

```tsx
import { getDailyBudget } from "@/lib/planning";
import { dailyBudget } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
```

No `Promise.all` das queries, acrescente `getDailyBudget()` como quinto item e `budget` como quinto elemento desestruturado:

```tsx
  const [rows, activeItems, activeCards, categories, budget] = await Promise.all([
```

Depois de `const isEmpty = views.length === 0;`, acrescente:

```tsx
  // Reserva do dia a dia: meta de gasto variável do mês em tela, caindo por dia
  // que passa. Não entra em nenhum total — os gastos reais vêm pela fatura.
  const budgetView = budget ? dailyBudget(month, todayISOInSaoPaulo(), budget.perDayCents) : null;
```

E troque a `<div>` da grade de StatCards por:

```tsx
          <div
            className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${budgetView ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
          >
            <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" icon={TrendingUp} />
            <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" icon={TrendingDown} />
            <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone={plannedBalance(views) < 0 ? "expense" : "default"} icon={Wallet} />
            <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" icon={Clock} />
            {budgetView && (
              <StatCard
                label="Reserva do dia a dia"
                value={formatCents(budgetView.remainingCents)}
                hint={`${budgetView.daysRemaining} de ${budgetView.daysInMonth} dias · ${formatCents(budgetView.perDayCents)}/dia`}
                icon={PiggyBank}
              />
            )}
          </div>
```

- [ ] **Step 3: Card da reserva no Dashboard**

Em `app/(app)/dashboard/page.tsx`, `PiggyBank` e `todayISOInSaoPaulo` já estão importados. Falta acrescentar `getDailyBudget` ao import existente de `@/lib/planning` (que hoje traz `getNegativeMonths, getReserves`) e um import novo:

```tsx
import { dailyBudget } from "@/lib/daily-budget";
```

Acrescente `getDailyBudget()` ao `Promise.all` que já busca `getNegativeMonths()` e `getReserves()`, desestruturando `budget` no fim da lista (a lista atual é `[negativeMonths, reserves, investAssets, renewalItems]`), e depois de `const reservesTotalCents = ...`:

```tsx
  const budgetView = budget ? dailyBudget(month, todayISOInSaoPaulo(), budget.perDayCents) : null;
```

Troque a grade de StatCards por:

```tsx
      <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${budgetView ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" icon={TrendingUp} />
        <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" icon={TrendingDown} />
        <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone={plannedBalance(views) < 0 ? "expense" : "default"} icon={Wallet} />
        <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" icon={Clock} />
        {budgetView && (
          <StatCard
            label="Reserva do dia a dia"
            value={formatCents(budgetView.remainingCents)}
            hint={`${budgetView.daysRemaining} de ${budgetView.daysInMonth} dias · ${formatCents(budgetView.perDayCents)}/dia`}
            icon={PiggyBank}
          />
        )}
      </div>
```

- [ ] **Step 4: Card com edição em Reservas**

Crie `app/(app)/reservas/DailyBudgetCard.tsx`:

```tsx
"use client";
import { useActionState } from "react";
import { PiggyBank } from "lucide-react";
import { setDailyBudget, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Card, CardContent } from "@/components/ui/card";
import { useActionToast } from "@/hooks/use-action-toast";

/**
 * Reserva do dia a dia: mostra o que resta no mês corrente e permite mudar o
 * valor por dia. O texto deixa explícito que é meta — se ficasse junto do
 * "Total guardado" das caixinhas, pareceria dinheiro parado.
 */
export function DailyBudgetCard({
  perDayCents,
  daysRemaining,
  daysInMonth,
  remainingCents,
  monthTotalCents,
}: {
  perDayCents: number;
  daysRemaining: number;
  daysInMonth: number;
  remainingCents: number;
  monthTotalCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setDailyBudget, {});
  useActionToast(state, { success: "Reserva por dia atualizada." });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PiggyBank className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
              Reserva do dia a dia
            </div>
            <div className="text-xl font-bold tabular-nums">{formatCents(remainingCents)}</div>
            <div className="text-[11px] text-muted-foreground">
              {daysRemaining} de {daysInMonth} dias · mês cheio {formatCents(monthTotalCents)}
            </div>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-1.5">
          <Label htmlFor="daily-budget-amount">Valor por dia</Label>
          <div className="flex items-center gap-2">
            <CurrencyInput id="daily-budget-amount" name="amountPerDay" defaultCents={perDayCents} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Salvar
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground">
          Meta de gasto do dia a dia — não entra no &quot;Total guardado&quot; nem no saldo do mês. Os gastos
          reais chegam pela fatura do cartão.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Ligue o card na tela Reservas**

Em `app/(app)/reservas/page.tsx`, acrescente aos imports:

```tsx
import { getReserves, getNegativeMonths, getDailyBudget } from "@/lib/planning";
import { dailyBudget } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { DailyBudgetCard } from "./DailyBudgetCard";
```

Troque o `Promise.all` e acrescente o cálculo (a tela não tem seletor de mês, então usa o mês corrente):

```tsx
  const [reserves, negativeMonths, budget] = await Promise.all([
    getReserves(),
    getNegativeMonths(),
    getDailyBudget(),
  ]);
  const totalCents = sumCents(reserves.map((r) => r.amountCents));
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo
  const today = todayISOInSaoPaulo();
  const budgetView = budget ? dailyBudget(today.slice(0, 7), today, budget.perDayCents) : null;
```

E, logo depois da `<div>` dos StatCards de "Total guardado"/"Descoberto", acrescente:

```tsx
      {budgetView && (
        <DailyBudgetCard
          perDayCents={budgetView.perDayCents}
          daysRemaining={budgetView.daysRemaining}
          daysInMonth={budgetView.daysInMonth}
          remainingCents={budgetView.remainingCents}
          monthTotalCents={budgetView.monthTotalCents}
        />
      )}
```

- [ ] **Step 6: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 7: Commit**

```bash
git add components/StatCard.tsx app/\(app\)/reservas app/\(app\)/mes/page.tsx app/\(app\)/dashboard/page.tsx
git commit -m "feat: reserva do dia a dia no Dashboard, no Mês e em Reservas"
```

---

### Task 6: Verificação de ponta a ponta

**Files:**
- Nenhum arquivo alterado (só verificação; qualquer correção necessária vira commit próprio).

**Interfaces:**
- Consumes: tudo das Tasks 1-5.
- Produces: evidência de que o conjunto passa.

- [ ] **Step 1: Suíte completa + tipos + lint + build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde. Não afirme "funcionando" sem esta saída.

- [ ] **Step 2: E2E**

Run: `npm run e2e`
Expected: PASS. O e2e reseta o schema `e2e` e roda as migrations, então a tabela nova (com o valor inicial) é exercitada num banco limpo.

- [ ] **Step 3: Patch temporário de bypass de auth**

As telas ficam atrás de login; para screenshotar, neutralize a auth **sem commitar**.

`middleware.ts` — troque a linha 1 por um pass-through:

```ts
import { NextResponse } from "next/server";
export function middleware() {
  return NextResponse.next();
}
```

`app/(app)/layout.tsx` — comente a linha 9:

```ts
  // if (!session) redirect("/login");
```

Run: `npm run build && npx next start -p 3123 &`
Expected: servidor respondendo em `http://localhost:3123`.

- [ ] **Step 4: Capture os screenshots**

Crie `scripts/_shoot.mjs` (tem que ficar **dentro** do projeto para resolver `@playwright/test`; o chromium já está instalado):

```js
// TEMPORÁRIO — deletar depois de olhar os PNGs. Não commitar.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3123";
const OUT = "/tmp/shots-reserva";
const PAGES = [
  ["panorama", "/panorama"],
  ["mes-jul", "/mes?month=2026-07"],
  ["mes-ago", "/mes?month=2026-08"],
  ["dashboard", "/dashboard?month=2026-08"],
  ["reservas", "/reservas"],
];
const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [vpName, viewport] of VIEWPORTS) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await ctx.newPage();
    for (const [name, path] of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const file = `${OUT}/${name}-${vpName}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await ctx.close();
  }
}
await browser.close();
```

Run: `node scripts/_shoot.mjs`

Leia os PNGs (a ferramenta Read exibe imagens) e confira:

- `panorama-*` — a coluna de jul/26 mostrando o que falta: "Almoço" em **âmbar** com o valor reduzido e a contagem; contas quitadas em **`0,00` verde** (não `—`); o rodapé com os rótulos **A receber / A pagar / Saldo a realizar**; a legenda do topo mencionando "valores = o que ainda falta".
- `mes-jul-*` e `mes-ago-*` — o quinto card "Reserva do dia a dia". Em jul/26 (mês corrente) o valor tem que ser menor que o mês cheio e o detalhe mostrar "N de 31 dias · R$ 100,00/dia"; em ago/26 (futuro) tem que mostrar os 31 dias e R$ 3.100,00. Confira que a grade não estourou a largura no mobile.
- `dashboard-*` — o mesmo card, com a grade de 5 intacta.
- `reservas-*` — o card com o valor por dia preenchido (R$ 100,00), o texto de meta, e o campo de edição.

- [ ] **Step 5: Reverta os patches temporários**

Run: `kill %1; git checkout middleware.ts "app/(app)/layout.tsx" && rm -f scripts/_shoot.mjs && git status --short`
Expected: árvore limpa (nenhum patch de bypass, nenhum script de screenshot commitado).

- [ ] **Step 6: Teste manual das duas partes**

No servidor local (ou depois do deploy):

1. **Panorama**: na tela Mês de jul/26, pague uma ocorrência de "Almoço" e volte ao Panorama. O valor da célula tem que ter caído R$ 50,00, e as linhas "A pagar" e "Saldo a realizar" acompanham. Desfaça a baixa e confirme que o valor volta.
2. **Reserva**: em Reservas, mude o valor por dia para R$ 50,00, salve, e confira que o card e os das outras duas telas passam a mostrar metade. **Volte para R$ 100,00 no fim** — é o valor real do usuário.

Anote os valores antes e depois no relatório e confirme que o banco terminou como começou.

- [ ] **Step 7: Feche a verificação**

```bash
git status --short
git log --oneline -6
```

Se alguma correção foi necessária, commite-a antes. Não faça push sem o usuário pedir.

---

## Notas de execução

- **Ordem importa:** Task 1 antes de 2 (a UI consome `remainingCents` e os campos renomeados; entre as duas, `tsc` fica quebrado de propósito). Task 3 antes de 4 e 5. Task 6 no fim.
- **Migration em produção:** o `.env` aponta para o banco real. A Task 4 aplica DDL nele — é o procedimento do projeto (17 migrations anteriores), mas revise o SQL antes de aplicar.
- **Fora de escopo (não faça):** comparar a reserva com o gasto real; a reserva como linha do Panorama ou do mês; valor por dia variável por mês ou por dia da semana; rever a decisão de a célula do Panorama mostrar o restante (foi escolha explícita do usuário, ciente de que a comparação entre colunas se perde).
