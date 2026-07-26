# Reserva do dia a dia como despesa do mês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reserva do dia a dia deixa de ser meta e passa a ser despesa do mês — linha própria na tela Mês e no Panorama, pesando em todos os totais, com valor `dias restantes × valor por dia` que cai sozinho a cada dia.

**Architecture:** A linha **não** é gravada no banco: um descritor derivado (`dailyBudgetLine`) é calculado do calendário e injetado nos arrays que cada tela já usa (`views` para os cálculos e a lista, `MatrixEntry[]` para a matriz). Injetar antes dos cálculos garante que lista e totais saiam do mesmo array e não possam divergir. Gravar exigiria um job diário reescrevendo o valor e ficaria errado no dia em que ele não rodasse.

**Tech Stack:** Next.js 16.2.10 (App Router, Server Actions), React 19.2, Prisma 7.8 + Postgres, Zod 4, Tailwind 4 + shadcn/ui, Vitest 4 (unit), Playwright (e2e).

## Global Constraints

- **Leia o guia do Next em `node_modules/next/dist/docs/` antes de escrever código que toque APIs do framework** (`AGENTS.md`: esta versão do Next tem breaking changes em relação ao conhecimento pré-treinado).
- Dinheiro em **centavos inteiros**; `Decimal` do Prisma convertido com `decimalToCents(String(v))` e escrito com `centsToNumber(cents)` (`lib/money.ts`). Nenhuma aritmética de dinheiro em float.
- Meses são strings `"YYYY-MM"`; datas de dia são `"YYYY-MM-DD"`; aritmética de data em UTC. "Hoje" vem sempre de `todayISOInSaoPaulo()` (`lib/fatura.ts`), nunca do relógio do servidor.
- **`formatCents` usa espaço inseparável (U+00A0)** entre "R$" e o número. Em teste, normalize antes de comparar — o helper que o projeto já usa é `const norm = (s: string) => s.replace(/[  ]/g, " ");` (ver `tests/money.test.ts:4`).
- Comentários e textos de UI em **português do Brasil**, com acentuação correta. Comentários explicam o *porquê*.
- Server Actions retornam `ActionState` (`{ error?, ok?, count? }`), consumidas via `useActionState` + `useActionToast`, e chamam `revalidateFinance()` (`lib/revalidate.ts`).
- Nada de `useEffect` para fechar dialog/popover: o padrão é ajustar estado durante a renderização.
- Tailwind claro/escuro: cor sempre no par `text-X-600 dark:text-X-400`.
- **Regra de negócio:** o valor da reserva num mês é `perDayCents × daysRemaining` — mês futuro = mês cheio, mês corrente decaindo (hoje conta), mês passado **zero**. Não há "previsto" separado do "restante": é um número só.
- **A reserva não é paga, editada nem excluída** — nenhuma tela pode oferecer essas ações sobre ela, porque não existe `MonthlyEntry` por trás.
- Nenhuma migration nesta entrega: `DailyBudget.amountPerDay` já existe e está preenchido com R$ 100,00.

---

### Task 1: O descritor da linha derivada

**Files:**
- Modify: `lib/daily-budget.ts:1-8` (cabeçalho), fim do arquivo (novos exports)
- Modify: `lib/entries.ts` (adaptador para `EntryView`)
- Test: `tests/daily-budget.test.ts`

**Interfaces:**
- Consumes: `dailyBudget(month, todayISO, perDayCents): DailyBudgetView` e `daysInMonth(month)`, já existentes em `lib/daily-budget.ts`; `formatCents` de `@/lib/money`; `EntryView` de `@/lib/calc`.
- Produces:
  - `DAILY_BUDGET_LINE = "Reserva do dia a dia"` (nome da linha **e** da categoria)
  - `DAILY_BUDGET_ENTRY_ID = "daily-budget"` (chave estável de React; não é id de banco)
  - `type DailyBudgetLine = { line: string; categoryName: string; categoryType: "EXPENSE"; cents: number; daysRemaining: number; daysInMonth: number; perDayCents: number; hint: string }`
  - `dailyBudgetLine(month: string, todayISO: string, perDayCents: number): DailyBudgetLine`
  - `dailyBudgetEntryView(line: DailyBudgetLine): EntryView` em `lib/entries.ts`

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/daily-budget.test.ts`, troque a linha 2 do arquivo por (acrescentando os novos imports e o normalizador de espaço inseparável):

```ts
import { dailyBudget, daysInMonth, dailyBudgetLine, DAILY_BUDGET_LINE } from "@/lib/daily-budget";

const norm = (s: string) => s.replace(/[  ]/g, " ");
```

E acrescente ao fim do arquivo:

```ts
describe("dailyBudgetLine", () => {
  it("mês corrente: valor é o restante, com hint explicando", () => {
    const l = dailyBudgetLine("2026-07", "2026-07-26", CEM);
    expect(l).toMatchObject({
      line: DAILY_BUDGET_LINE,
      categoryName: DAILY_BUDGET_LINE,
      categoryType: "EXPENSE",
      cents: 60000,
      daysRemaining: 6,
      daysInMonth: 31,
      perDayCents: CEM,
    });
    expect(norm(l.hint)).toBe("6 de 31 dias · R$ 100,00/dia");
  });

  it("mês futuro: mês cheio", () => {
    const l = dailyBudgetLine("2026-08", "2026-07-26", CEM);
    expect(l).toMatchObject({ cents: 310000, daysRemaining: 31, daysInMonth: 31 });
    expect(norm(l.hint)).toBe("31 de 31 dias · R$ 100,00/dia");
  });

  it("mês passado: zero, mas a linha existe", () => {
    const l = dailyBudgetLine("2026-06", "2026-07-26", CEM);
    expect(l).toMatchObject({ cents: 0, daysRemaining: 0, daysInMonth: 30 });
    expect(norm(l.hint)).toBe("0 de 30 dias · R$ 100,00/dia");
  });

  it("fevereiro de 28 e de 29 dias", () => {
    expect(dailyBudgetLine("2027-02", "2027-02-01", CEM)).toMatchObject({ cents: 280000, daysInMonth: 28 });
    expect(dailyBudgetLine("2028-02", "2028-02-01", CEM)).toMatchObject({ cents: 290000, daysInMonth: 29 });
  });

  it("outro valor por dia entra no hint", () => {
    expect(norm(dailyBudgetLine("2026-08", "2026-07-26", 5050).hint)).toBe("31 de 31 dias · R$ 50,50/dia");
  });
});
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `npx vitest run tests/daily-budget.test.ts`
Expected: FAIL — `dailyBudgetLine` e `DAILY_BUDGET_LINE` não existem.

- [ ] **Step 3: Corrija o cabeçalho do módulo**

O comentário atual (linhas 1-8) afirma que o valor "nunca soma no saldo do mês" — isso deixou de ser verdade. Substitua-o por:

```ts
/**
 * Reserva do dia a dia: o mês reserva um valor por dia (R$ 100/dia = R$ 3.100
 * num mês de 31 dias) e o que resta cai a cada dia que passa.
 *
 * O que resta é DESPESA do mês: entra como linha derivada na tela Mês e no
 * Panorama e pesa em todos os totais. Não conta o mesmo dinheiro duas vezes
 * junto com a fatura do cartão porque só o RESTANTE entra — os dias já vividos
 * saem daqui no mesmo ritmo em que aparecem na fatura, então os dois nunca
 * contam o mesmo dia.
 */

import { formatCents } from "@/lib/money";
```

- [ ] **Step 4: Implemente o descritor**

Acrescente ao fim de `lib/daily-budget.ts`:

```ts
/** Nome da linha e da categoria da reserva na visão mensal. */
export const DAILY_BUDGET_LINE = "Reserva do dia a dia";

/**
 * Chave estável da linha derivada (usada como `key` de React e como sufixo de
 * id na matriz). NÃO é id de banco — não existe `MonthlyEntry` por trás.
 */
export const DAILY_BUDGET_ENTRY_ID = "daily-budget";

/**
 * Linha derivada da reserva num mês. Não existe no banco: é calculada do
 * calendário, e é isso que permite ela cair sozinha a cada dia — uma linha
 * gravada precisaria de um job diário e ficaria errada no dia em que ele não
 * rodasse. Não é paga, editada nem excluída.
 */
export type DailyBudgetLine = {
  line: string;
  categoryName: string;
  categoryType: "EXPENSE";
  /** `perDayCents × daysRemaining`: mês cheio no futuro, decaindo no corrente, 0 no passado. */
  cents: number;
  daysRemaining: number;
  daysInMonth: number;
  perDayCents: number;
  /** "6 de 31 dias · R$ 100,00/dia" — explica de onde vem o valor. */
  hint: string;
};

export function dailyBudgetLine(month: string, todayISO: string, perDayCents: number): DailyBudgetLine {
  const v = dailyBudget(month, todayISO, perDayCents);
  return {
    line: DAILY_BUDGET_LINE,
    categoryName: DAILY_BUDGET_LINE,
    categoryType: "EXPENSE",
    cents: v.remainingCents,
    daysRemaining: v.daysRemaining,
    daysInMonth: v.daysInMonth,
    perDayCents: v.perDayCents,
    hint: `${v.daysRemaining} de ${v.daysInMonth} dias · ${formatCents(v.perDayCents)}/dia`,
  };
}
```

- [ ] **Step 5: Rode os testes e confirme que passam**

Run: `npx vitest run tests/daily-budget.test.ts`
Expected: PASS, incluindo os casos de `dailyBudget`/`daysInMonth` que já existiam.

- [ ] **Step 6: Adaptador para a forma que os cálculos consomem**

Três telas precisam da linha na forma de `EntryView`. O adaptador mora em `lib/entries.ts`, que é o módulo que já faz essa conversão (`toEntryView`) — assim `lib/daily-budget.ts` não precisa conhecer `lib/calc.ts`.

Acrescente ao fim de `lib/entries.ts`:

```ts
import type { DailyBudgetLine } from "@/lib/daily-budget";

/**
 * Linha derivada da reserva na forma que `lib/calc.ts` consome. Nunca paga: o
 * valor cai pelo calendário, não por baixa.
 */
export function dailyBudgetEntryView(line: DailyBudgetLine): EntryView {
  return {
    itemName: line.line,
    categoryName: line.categoryName,
    categoryType: line.categoryType,
    plannedCents: line.cents,
    paid: false,
    paidCents: null,
  };
}
```

O `import type { DailyBudgetLine }` vai junto dos imports do topo do arquivo, não no meio.

- [ ] **Step 7: Verifique tipos e a suíte**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros; todos os testes passam.

- [ ] **Step 8: Commit**

```bash
git add lib/daily-budget.ts lib/entries.ts tests/daily-budget.test.ts
git commit -m "feat: descritor da linha derivada da reserva do dia a dia"
```

---

### Task 2: A reserva na tela Mês

**Files:**
- Modify: `app/(app)/mes/page.tsx:30-42` (tipo `DisplayRow`), `:66-122` (`EntryRow`), `:185-211` (montagem de `views`), `:235-240` (`TransferDialog`), `:255-271` (grade de StatCards)
- Test: `tests/calc.test.ts`

**Interfaces:**
- Consumes: `dailyBudgetLine`, `DAILY_BUDGET_ENTRY_ID` (`@/lib/daily-budget`); `dailyBudgetEntryView` (`@/lib/entries`); `getDailyBudget` (`@/lib/planning`, já usado nesta página).
- Produces: `DisplayRow` ganha `readOnlyHint: string | null`.

- [ ] **Step 1: Escreva os testes que falham**

A garantia que importa é que os cálculos do mês tratem a linha derivada como despesa não paga. Em `tests/calc.test.ts`, ajuste o import do topo para incluir o adaptador e o descritor, e acrescente ao fim do arquivo:

```ts
import { dailyBudgetEntryView } from "@/lib/entries";
import { dailyBudgetLine } from "@/lib/daily-budget";

describe("reserva do dia a dia nos cálculos do mês", () => {
  // 6 dias restantes × R$ 100 = R$ 600,00
  const reserva = dailyBudgetEntryView(dailyBudgetLine("2026-07", "2026-07-26", 10000));
  const comReserva: EntryView[] = [...E, reserva];

  it("conta como despesa não paga", () => {
    expect(reserva).toMatchObject({ plannedCents: 60000, paid: false, paidCents: null, categoryType: "EXPENSE" });
  });
  it("entra em plannedExpense", () => {
    expect(plannedExpense(comReserva)).toBe(87000 + 60000);
  });
  it("piora o saldo", () => {
    expect(plannedBalance(comReserva)).toBe(2413000 - 60000);
  });
  it("entra em remainingToPay, porque nunca está paga", () => {
    expect(remainingToPay(comReserva)).toBe(81000 + 60000);
  });
  it("aparece na categoria própria e no ranking", () => {
    // Busca por nome, não por posição: "Assinaturas" soma 65.000 nesta fixture
    // e fica à frente da reserva (60.000) na ordenação por categoria.
    expect(expenseByCategory(comReserva).find((c) => c.categoryName === "Reserva do dia a dia")).toEqual({
      categoryName: "Reserva do dia a dia",
      cents: 60000,
    });
    // No ranking por ITEM ela é a maior — PS PLUS sozinho é 59.000.
    expect(expenseRanking(comReserva)[0]).toEqual({ itemName: "Reserva do dia a dia", cents: 60000 });
  });
  it("mês passado não muda nada", () => {
    const passado = dailyBudgetEntryView(dailyBudgetLine("2026-06", "2026-07-26", 10000));
    expect(plannedExpense([...E, passado])).toBe(87000);
  });
});
```

- [ ] **Step 2: Rode os testes**

Run: `npx vitest run tests/calc.test.ts`
Expected: **PASS já na primeira execução** — e isso é o esperado, não um erro. O adaptador e o descritor vêm prontos da Task 1, e `lib/calc.ts` não muda nesta task; o papel destes testes é travar o contrato ("a reserva é despesa não paga e entra nos quatro cálculos") **antes** de a tela ser mexida, para que qualquer regressão nos Steps seguintes apareça como teste vermelho.

Se algum deles falhar, pare: significa que o descritor da Task 1 não está com os valores certos, e o conserto é lá, não aqui.

- [ ] **Step 3: `DisplayRow` ganha o hint de linha somente-leitura**

Em `app/(app)/mes/page.tsx`, no tipo `DisplayRow`, acrescente ao fim da lista de campos:

```ts
  /** Preenchido só em linha derivada (reserva): substitui as ações, que não existem. */
  readOnlyHint: string | null;
```

- [ ] **Step 4: `EntryRow` não oferece ações na linha derivada**

Ainda em `app/(app)/mes/page.tsx`, dentro de `EntryRow`, troque as declarações de `pay` e `actions` por:

```tsx
  // Linha derivada (reserva do dia a dia): não há MonthlyEntry por trás, então
  // não se paga, não se edita e não se exclui — no lugar do botão vai a
  // explicação de onde o valor vem.
  const pay = row.readOnlyHint ? (
    <span className="text-xs text-muted-foreground">{row.readOnlyHint}</span>
  ) : (
    <PayCell
      entryId={row.entryId}
      plannedCents={row.plannedCents}
      paid={row.paid}
      paidCents={row.paidCents}
      paidDate={row.paidDate}
      income={income}
    />
  );
```

e

```tsx
  const actions = row.readOnlyHint ? null : (
    <EntryActions
      entryId={row.entryId}
      label={row.itemName}
      installmentId={row.installmentId}
      plannedCents={row.plannedCents}
      canRecur={row.itemId === null && row.cardId === null}
      isRecurring={row.itemId !== null}
      categories={categories}
    />
  );
```

`planned` não precisa de mudança: ele já renderiza um `<span>` simples quando `itemId` é `null`, que é o caso da linha derivada.

- [ ] **Step 5: Injete a linha antes dos cálculos**

Troque o bloco que monta `views`, calcula `groups`/`isEmpty` e o `budgetView` (linhas ~185-211) por:

```tsx
  const realViews: DisplayRow[] = rows.map((r) => ({
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
  }));

  // `isEmpty` olha só os lançamentos REAIS: um mês sem conta nenhuma continua
  // mostrando o estado vazio, em vez de meia tela ocupada só pela reserva.
  const isEmpty = realViews.length === 0;

  // A reserva do dia a dia é despesa derivada do calendário. Ela entra em
  // `views` ANTES dos cálculos, para a lista e os totais saírem do mesmo array
  // e não poderem divergir.
  const budgetLine = budget && !isEmpty ? dailyBudgetLine(month, todayISOInSaoPaulo(), budget.perDayCents) : null;
  const views: DisplayRow[] = budgetLine
    ? [
        ...realViews,
        {
          ...dailyBudgetEntryView(budgetLine),
          entryId: DAILY_BUDGET_ENTRY_ID,
          itemId: null,
          dueDay: null,
          renewsThisMonth: false,
          purchaseDate: null,
          paidDate: null,
          cardId: null,
          cardName: null,
          installmentId: null,
          installmentSeq: null,
          installmentCount: null,
          readOnlyHint: budgetLine.hint,
        },
      ]
    : realViews;

  const groups = groupByCategory(views);
```

Ajuste os imports: acrescente `dailyBudgetLine` e `DAILY_BUDGET_ENTRY_ID` ao import de `@/lib/daily-budget` (que hoje traz `dailyBudget`), troque `dailyBudget` por eles se ele não for mais usado, e acrescente `dailyBudgetEntryView` ao import de `@/lib/entries` (que hoje traz `toEntryView`).

- [ ] **Step 6: Tire a linha derivada do `TransferDialog`**

O `TransferDialog` transfere valor entre dois `MonthlyEntry` reais. Se a linha derivada entrar na lista, ela aparece como origem/destino e a Server Action falha ao buscar um registro que não existe. Troque `views` por `realViews` ali:

```tsx
          <TransferDialog
            entries={realViews.map((v) => ({ id: v.entryId, label: v.itemName, plannedCents: v.plannedCents }))}
          />
```

- [ ] **Step 7: Remova o card "(meta)" e volte a grade para 4**

O valor agora vive na linha e dentro de "Despesas" — o card repetiria o número, e o rótulo "(meta)" passou a ser falso. Troque a `<div>` da grade de StatCards por:

```tsx
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" icon={TrendingUp} />
            <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" icon={TrendingDown} />
            <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone={plannedBalance(views) < 0 ? "expense" : "default"} icon={Wallet} />
            <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" icon={Clock} />
          </div>
```

Remova `PiggyBank` do import de `lucide-react` se ele não for mais usado no arquivo.

- [ ] **Step 8: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

Run: `grep -n "budgetView" "app/(app)/mes/page.tsx"`
Expected: nenhuma saída (o card saiu junto com a variável).

- [ ] **Step 9: Commit**

```bash
git add app/\(app\)/mes/page.tsx tests/calc.test.ts
git commit -m "feat: reserva do dia a dia entra como despesa na tela Mês"
```

---

### Task 3: A reserva no Panorama

**Files:**
- Modify: `lib/matrix.ts:6-29` (união de `kind` em `MatrixEntry` e `MatrixCell`)
- Modify: `app/(app)/panorama/page.tsx:18-37` (query e montagem das entradas)
- Modify: `app/(app)/panorama/CellAction.tsx:17-35` (tipo da prop `kind`), `:99-120` (ramos por `kind`), `:121-137` (botão de baixa)
- Test: `tests/matrix.test.ts`

**Interfaces:**
- Consumes: `dailyBudgetLine`, `DAILY_BUDGET_ENTRY_ID` (`@/lib/daily-budget`); `getDailyBudget` (`@/lib/planning`).
- Produces: `MatrixEntry["kind"]` e `MatrixCell["kind"]` passam a aceitar `"budget"`.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente ao fim do `describe("buildMatrix")` em `tests/matrix.test.ts`:

```ts
  it("linha derivada da reserva entra como despesa não paga", () => {
    const comReserva = buildMatrix([
      { line: "Luz", categoryName: "Moradia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 18000, paid: false, entryId: "l1", kind: "item" as const },
      { line: "Reserva do dia a dia", categoryName: "Reserva do dia a dia", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 310000, paid: false, entryId: "daily-budget-2026-08", kind: "budget" as const },
    ]);
    const secao = comReserva.sections.find((s) => s.categoryName === "Reserva do dia a dia")!;
    expect(secao.rows[0].cells["2026-08"]).toMatchObject({
      cents: 310000,
      remainingCents: 310000,
      allPaid: false,
      count: 1,
      kind: "budget",
    });
    expect(secao.totalsByMonth["2026-08"]).toBe(310000);
    expect(comReserva.toPayByMonth["2026-08"]).toBe(18000 + 310000);
    expect(comReserva.balanceByMonth["2026-08"]).toBe(-(18000 + 310000));
  });

  it("reserva de mês passado vale zero sem virar quitada", () => {
    const passado = buildMatrix([
      { line: "Reserva do dia a dia", categoryName: "Reserva do dia a dia", categoryType: "EXPENSE" as const, monthISO: "2026-06", cents: 0, paid: false, entryId: "daily-budget-2026-06", kind: "budget" as const },
    ]);
    expect(passado.sections[0].rows[0].cells["2026-06"]).toMatchObject({ cents: 0, remainingCents: 0, allPaid: false });
    expect(passado.toPayByMonth["2026-06"]).toBe(0);
  });
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `npx vitest run tests/matrix.test.ts`
Expected: FAIL — `kind: "budget"` não pertence à união de tipos.

- [ ] **Step 3: Abra a união de `kind`**

Em `lib/matrix.ts`, no tipo `MatrixEntry`, troque o campo `kind` e seu comentário por:

```ts
  /**
   * "card" = consolidado de cartão (valor vem do extrato, não se edita aqui);
   * "budget" = reserva do dia a dia (derivada do calendário, não se paga nem
   * se edita).
   */
  kind: "item" | "card" | "loose" | "budget";
```

E em `MatrixCell`, o mesmo tipo no campo `kind`:

```ts
  kind: "item" | "card" | "loose" | "budget";
```

Nada muda na lógica de `buildMatrix`: a promoção `if (e.kind === "card") cell.kind = "card"` continua valendo só para cartão, e uma célula de reserva tem uma única ocorrência.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `npx vitest run tests/matrix.test.ts`
Expected: PASS.

- [ ] **Step 5: Injete uma linha por mês na matriz**

Em `app/(app)/panorama/page.tsx`, troque o bloco da query e da montagem de `entries` (até a chamada de `buildMatrix`) por:

```tsx
  const [rows, budget] = await Promise.all([
    prisma.monthlyEntry.findMany({
      include: { item: { include: { category: true } }, category: true, card: true },
    }),
    getDailyBudget(),
  ]);

  const entries: MatrixEntry[] = rows.map((r) => {
    const category = r.item?.category ?? r.category;
    return {
      line: r.item?.name ?? r.card?.name ?? r.description ?? "—",
      categoryName: category?.name ?? "Sem categoria",
      categoryType: category?.type ?? "EXPENSE",
      monthISO: monthStringFromDate(r.month),
      cents: decimalToCents(String(r.plannedAmount)),
      paid: r.paid,
      entryId: r.id,
      kind: r.cardId ? ("card" as const) : r.itemId ? ("item" as const) : ("loose" as const),
    };
  });

  const today = todayISOInSaoPaulo();
  const currentMonth = today.slice(0, 7);

  // Uma linha de reserva por mês que a matriz JÁ mostra — a reserva não cria
  // meses novos na visão. O valor cai sozinho: mês cheio no futuro, decaindo
  // no corrente, zero no passado.
  if (budget) {
    for (const monthISO of new Set(entries.map((e) => e.monthISO))) {
      const l = dailyBudgetLine(monthISO, today, budget.perDayCents);
      entries.push({
        line: l.line,
        categoryName: l.categoryName,
        categoryType: l.categoryType,
        monthISO,
        cents: l.cents,
        paid: false,
        entryId: `${DAILY_BUDGET_ENTRY_ID}-${monthISO}`,
        kind: "budget",
      });
    }
  }

  const matrix = buildMatrix(entries);
```

Ajuste os imports: acrescente `import { getDailyBudget } from "@/lib/planning";` e `import { dailyBudgetLine, DAILY_BUDGET_ENTRY_ID } from "@/lib/daily-budget";`. A declaração antiga de `currentMonth` (que ficava depois de `buildMatrix`) sai, porque agora ela vem de `today`.

- [ ] **Step 6: A célula da reserva não oferece edição nem baixa**

Em `app/(app)/panorama/CellAction.tsx`:

No tipo da prop `kind`, troque por:

```tsx
  kind: "item" | "card" | "loose" | "budget";
```

O formulário de edição do previsto hoje aparece quando `kind !== "card" && count === 1` — isso deixaria a reserva editável. Troque a condição para listar explicitamente quem é editável:

```tsx
          {(kind === "item" || kind === "loose") && count === 1 && (
```

Acrescente o ramo da reserva logo depois do ramo de `kind === "card"`:

```tsx
          {kind === "budget" && (
            <p className="text-xs text-muted-foreground">
              Reserva do dia a dia — cai sozinha a cada dia que passa. Mude o valor por dia em Reservas.
            </p>
          )}
```

E o formulário de baixa inteiro passa a ficar atrás de uma condição, porque a reserva não se paga:

```tsx
          {kind !== "budget" && (
            <form action={payAction}>
              <input type="hidden" name="entryIds" value={JSON.stringify(payIds)} />
              <input type="hidden" name="paid" value={(!allPaid).toString()} />
              <Button type="submit" size="sm" className="w-full" variant={allPaid ? "outline" : "default"} disabled={payPending}>
                {allPaid
                  ? "Desfazer baixa"
                  : income
                    ? payIds.length > 1
                      ? `Receber todas (${payIds.length})`
                      : "Receber"
                    : payIds.length > 1
                      ? `Pagar todas (${payIds.length})`
                      : "Pagar"}
              </Button>
            </form>
          )}
```

- [ ] **Step 7: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 8: Commit**

```bash
git add lib/matrix.ts app/\(app\)/panorama/page.tsx app/\(app\)/panorama/CellAction.tsx tests/matrix.test.ts
git commit -m "feat: reserva do dia a dia como linha do Panorama"
```

---

### Task 4: A reserva no Dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:28-38` (montagem de `views`, pizza e ranking), `:60-61` (`budgetView` sai), `:67-85` (`balanceData`), `:94-107` (grade de StatCards)

**Interfaces:**
- Consumes: `dailyBudgetLine` (`@/lib/daily-budget`), `dailyBudgetEntryView` (`@/lib/entries`), `getDailyBudget` (`@/lib/planning`, já usado).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Injete a linha nas views do mês em tela**

Em `app/(app)/dashboard/page.tsx`, o `views` de hoje alimenta os StatCards, a pizza e o ranking. Como `getDailyBudget()` só é buscado mais abaixo (no segundo `Promise.all`), mova a injeção para depois dele. Troque a linha que monta `views` por:

```tsx
  const realViews = rows.map((r) => toEntryView(r as never));
```

E os cálculos que dependem dela (`catColor`, `pieData`, `ranking`, `hasExpenses`) descem para depois do `Promise.all` que traz `budget`. Logo após `const reservesTotalCents = ...`, acrescente:

```tsx
  // A reserva do dia a dia é despesa derivada do calendário: entra em views
  // antes dos totais, da pizza e do ranking, para os três somarem o mesmo.
  const today = todayISOInSaoPaulo();
  const views = budget
    ? [...realViews, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]
    : realViews;

  const catColor = new Map((await prisma.category.findMany()).map((c) => [c.name, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({
    categoryName: x.categoryName,
    value: x.cents,
    color: catColor.get(x.categoryName) ?? "#64748b",
  }));
  const ranking = expenseRanking(views).slice(0, 10);
  const hasExpenses = ranking.length > 0;
```

E remova as declarações antigas de `catColor`/`pieData`/`ranking`/`hasExpenses` de cima (linhas ~34-37), junto com a linha `const budgetView = ...`.

A reserva não tem `Category` cadastrada, então a pizza cai na cor padrão `#64748b` — cadastrar a categoria só para ter cor a colocaria nos seletores de nova compra sem motivo.

- [ ] **Step 2: Injete a linha em cada mês do gráfico de saldo**

Troque o corpo de `balanceData` por:

```tsx
  const balanceData: MonthlyBalancePoint[] = chartMonths.map((m) => {
    const base = viewsByMonth.get(m) ?? [];
    // Cada mês do gráfico carrega a sua reserva: mês cheio à frente, decaindo
    // no corrente, zero atrás.
    const v = budget ? [...base, dailyBudgetEntryView(dailyBudgetLine(m, today, budget.perDayCents))] : base;
    return {
      month: formatCompetencia(monthToDate(m)),
      incomeCents: plannedIncome(v),
      expenseCents: plannedExpense(v),
      balanceCents: plannedBalance(v),
    };
  });
```

- [ ] **Step 3: Remova o card "(meta)" e volte a grade para 4**

```tsx
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" icon={TrendingUp} />
        <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" icon={TrendingDown} />
        <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone={plannedBalance(views) < 0 ? "expense" : "default"} icon={Wallet} />
        <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" icon={Clock} />
      </div>
```

`PiggyBank` continua sendo usado no arquivo (no card de reservas guardadas), então o import fica. Ajuste os imports para trazer `dailyBudgetLine` em vez de `dailyBudget` e acrescente `dailyBudgetEntryView` ao import de `@/lib/entries`.

- [ ] **Step 4: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

Run: `grep -n "budgetView" "app/(app)/dashboard/page.tsx"`
Expected: nenhuma saída.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/dashboard/page.tsx
git commit -m "feat: reserva do dia a dia nos totais e gráficos do Dashboard"
```

---

### Task 5: Descoberto e o texto do card de Reservas

**Files:**
- Modify: `lib/planning.ts:10-36` (`getNegativeMonths`)
- Modify: `app/(app)/reservas/DailyBudgetCard.tsx:52-55` (texto)

**Interfaces:**
- Consumes: `dailyBudgetLine` (`@/lib/daily-budget`), `dailyBudgetEntryView` (`@/lib/entries`), `todayISOInSaoPaulo` (`@/lib/fatura`), e `getDailyBudget` (mesmo arquivo).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: `getNegativeMonths` passa a contar a reserva**

O "Descoberto (meses no vermelho)" precisa refletir o compromisso da reserva. Em `lib/planning.ts`, troque o corpo de `getNegativeMonths` (da montagem de `byMonth` até o `return`) por:

```ts
  const byMonth = new Map<string, EntryView[]>();
  for (const r of rows) {
    const key = monthStringFromDate(r.month);
    const list = byMonth.get(key) ?? [];
    list.push(toEntryView(r as never));
    byMonth.set(key, list);
  }

  // A reserva do dia a dia é despesa do mês, então pesa no descoberto: um mês
  // que fecharia no zero passa a precisar de cobertura.
  const budget = await getDailyBudget();
  const today = todayISOInSaoPaulo();

  const out: NegativeMonth[] = [];
  for (const [month, views] of byMonth) {
    const withBudget = budget
      ? [...views, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]
      : views;
    const balanceCents = plannedBalance(withBudget);
    if (balanceCents < 0) out.push({ month, balanceCents });
  }
  return out; // rows vêm ordenadas por mês; Map preserva a ordem de inserção
```

Acrescente aos imports do arquivo: `dailyBudgetEntryView` no import de `@/lib/entries` (que hoje traz `toEntryView`), `import { dailyBudgetLine } from "@/lib/daily-budget";` e `import { todayISOInSaoPaulo } from "@/lib/fatura";`.

`getDailyBudget` é declarada mais abaixo no mesmo arquivo — hoisting de `function` cobre isso, não precisa reordenar.

- [ ] **Step 2: Corrija o texto do card de Reservas**

Em `app/(app)/reservas/DailyBudgetCard.tsx`, o parágrafo final afirma que a reserva não entra no saldo — virou o oposto. Troque por:

```tsx
        <p className="text-xs text-muted-foreground">
          Entra como despesa do mês e cai a cada dia que passa. Não soma no &quot;Total guardado&quot; — aquilo é
          dinheiro parado em caixinhas.
        </p>
```

E o comentário do componente (que diz "O texto deixa explícito que é meta") passa a:

```tsx
/**
 * Reserva do dia a dia: mostra o que resta no mês corrente e permite mudar o
 * valor por dia. O texto separa as duas coisas que o usuário poderia confundir
 * — ela é despesa do mês, e não dinheiro guardado nas caixinhas.
 */
```

- [ ] **Step 3: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add lib/planning.ts app/\(app\)/reservas/DailyBudgetCard.tsx
git commit -m "feat: reserva pesa no descoberto e o card de Reservas diz a verdade"
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
Expected: PASS. Se falhar por ambiente (porta ocupada, timeout de servidor, falha de rede ao Postgres), repita uma vez antes de relatar — esses flakes já foram observados neste projeto.

- [ ] **Step 3: Confira os números contra o banco**

Crie `scripts/_conferir.ts`:

```ts
// TEMPORÁRIO — deletar depois de conferir. Não commitar.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { plannedExpense, plannedBalance, remainingToPay } from "@/lib/calc";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { getDailyBudget } from "@/lib/planning";

async function main() {
  const today = todayISOInSaoPaulo();
  const budget = await getDailyBudget();
  if (!budget) throw new Error("reserva não configurada");
  for (const m of ["2026-06", "2026-07", "2026-08"]) {
    const rows = await prisma.monthlyEntry.findMany({
      where: { month: monthToDate(m) },
      include: { item: { include: { category: true } }, category: true },
    });
    const base = rows.map((r) => toEntryView(r as never));
    const l = dailyBudgetLine(m, today, budget.perDayCents);
    const v = [...base, dailyBudgetEntryView(l)];
    console.log(
      `${m} (${monthStringFromDate(monthToDate(m))}): reserva ${formatCents(l.cents)} (${l.daysRemaining}/${l.daysInMonth} dias)` +
        ` · despesas ${formatCents(plannedExpense(base))} → ${formatCents(plannedExpense(v))}` +
        ` · saldo ${formatCents(plannedBalance(base))} → ${formatCents(plannedBalance(v))}` +
        ` · falta pagar ${formatCents(remainingToPay(v))}`,
    );
  }
  await prisma.$disconnect();
}
main();
```

Run: `npx tsx scripts/_conferir.ts && rm scripts/_conferir.ts`

Expected (hoje é 26/07/2026, reserva R$ 100/dia):
- `2026-06` — reserva `R$ 0,00` (0/30 dias), despesas e saldo **inalterados**
- `2026-07` — reserva `R$ 600,00` (6/31 dias), despesas +600, saldo −600
- `2026-08` — reserva `R$ 3.100,00` (31/31 dias), despesas +3.100, saldo −3.100

Se algum mês divergir, relate com os números — não conserte.

- [ ] **Step 4: Patch temporário de bypass de auth**

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

- [ ] **Step 5: Capture os screenshots**

Crie `scripts/_shoot.mjs` (tem que ficar **dentro** do projeto para resolver `@playwright/test`; o chromium já está instalado):

```js
// TEMPORÁRIO — deletar depois de olhar os PNGs. Não commitar.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3123";
const OUT = "/tmp/shots-despesa";
const PAGES = [
  ["panorama", "/panorama"],
  ["mes-jul", "/mes?month=2026-07"],
  ["mes-ago", "/mes?month=2026-08"],
  ["dashboard-ago", "/dashboard?month=2026-08"],
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

- `mes-jul-*` — a linha **"Reserva do dia a dia"** na lista, valor `R$ 600,00`, com `6 de 31 dias · R$ 100,00/dia` no lugar do botão Pagar e **sem** menu de ações. Apenas 4 StatCards (o card "(meta)" saiu). "Despesas" e "Falta pagar" incluindo os 600.
- `mes-ago-*` — a mesma linha valendo `R$ 3.100,00` com `31 de 31 dias`.
- `panorama-*` — a linha da reserva atravessando os meses: valor decaindo em jul/26, cheio nos futuros, `0,00` nos passados. Clicar na célula deve mostrar a explicação e **nenhum** botão Pagar nem campo de valor (confira abrindo o popover num screenshot dedicado, se necessário).
- `dashboard-ago-*` — 4 StatCards; a reserva aparecendo na pizza "Despesas por categoria" e no ranking; a soma da pizza fechando com o card "Despesas".
- `reservas-*` — o card com o texto novo ("Entra como despesa do mês e cai a cada dia que passa"), e o "Descoberto" refletindo os meses que passaram para o vermelho.

- [ ] **Step 6: Reverta os patches temporários**

Run: `kill %1; git checkout middleware.ts "app/(app)/layout.tsx" && rm -f scripts/_shoot.mjs scripts/_conferir.ts && git status --short`
Expected: árvore limpa.

- [ ] **Step 7: Teste manual do que o usuário vai fazer**

Com o app rodando (login real, senha do `.env`):

1. Na tela Mês de jul/26, confirme que a linha da reserva **não** tem botão Pagar nem menu de ações, e que "Despesas" bate com a soma das linhas da tela.
2. Em Reservas, mude o valor por dia para R$ 50,00 e salve. Confirme que a linha em Mês e no Panorama caiu para metade e que os totais acompanharam. **Volte para R$ 100,00** — é o valor real do usuário.
3. No Panorama, clique na célula da reserva e confirme que não há campo de valor nem botão de baixa.

Anote os valores antes e depois e confirme que o banco terminou como começou.

- [ ] **Step 8: Feche a verificação**

```bash
git status --short
git log --oneline -6
```

Se alguma correção foi necessária, commite-a antes. Não faça push sem o usuário pedir.

---

## Notas de execução

- **Ordem importa:** Task 1 primeiro (as outras quatro consomem o descritor e o adaptador). Tasks 2, 3, 4 e 5 são independentes entre si. Task 6 no fim.
- **Nenhuma migration:** `DailyBudget` já existe com R$ 100,00 gravados. Nada de `prisma migrate` nesta entrega.
- **Esta entrega reverte parte da anterior** (spec `2026-07-26-panorama-falta-reserva-diaria-design.md`, que tratava a reserva como meta fora das somas). O card "(meta)" do Mês e do Dashboard sai; o de Reservas fica com o texto corrigido. Ambos os specs ficam no repositório: o segundo declara que revê o primeiro.
- **Fora de escopo (não faça):** comparar a reserva com o gasto real; valor por dia por mês/dia da semana/categoria; provisionar a reserva como `MonthlyEntry`; mostrar a reserva em mês sem lançamento nenhum (o `isEmpty` continua olhando só os reais); corrigir a ausência de receita lançada nos meses futuros.
