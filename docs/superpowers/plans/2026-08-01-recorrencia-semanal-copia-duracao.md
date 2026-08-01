# Recorrência semanal na cópia + duração configurável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Copiar mês anterior"/"do ano passado" passam a recriar recorrências semanais (Diarista) no mês de destino, e quem cria uma recorrência escolhe por quantos meses ela é provisionada (padrão 12).

**Architecture:** Dois helpers puros em `lib/recurrence.ts` (`weeklyGroupsFrom`, `weekdayDatesInMonth`) descrevem o grupo semanal e suas datas; as duas actions de cópia os usam dentro da transação existente. A duração vira campo do `purchaseSchema` e do diálogo, convertida em ocorrências no ramo mensal. Spec: `docs/superpowers/specs/2026-08-01-recorrencia-semanal-copia-duracao-design.md`.

**Tech Stack:** Next.js (Server Actions), Prisma (PostgreSQL), Zod, Vitest.

## Global Constraints

- **Marcador de recorrência semanal (verificado no banco):** `itemId` nulo, `cardId` nulo, `installmentId` preenchido e **`installmentSeq` nulo** — parcelamentos sempre gravam `installmentSeq`, então não se confundem.
- **A cópia reaproveita o mesmo `installmentId`** do grupo de origem e é **idempotente**: grupo que já tenha qualquer lançamento no mês de destino é pulado.
- **Duração:** inteiro de **2 a 60**, padrão **12**; erro `Duração entre 2 e 60 meses`. No ramo mensal vira ocorrências: `Math.max(2, Math.round(recurrenceMonths / interval))`.
- Datas sempre UTC (`T00:00:00Z`); competência = 1º dia do mês UTC.
- Textos de UI em pt-BR com acentuação correta.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).
- Actions não têm harness de teste com banco (convenção do projeto): helpers puros levam os testes; as actions são validadas na verificação manual da Task 4.

---

### Task 1: Helpers `weekdayDatesInMonth` e `weeklyGroupsFrom`

**Files:**
- Modify: `lib/recurrence.ts` (após `createWeekdayRecurrence`)
- Create: `tests/recurrence.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces (Task 2 consome):
  - `type WeeklyGroup = { installmentId: string; description: string; categoryId: string | null; amount: number; weekdays: number[] }`
  - `weekdayDatesInMonth(month: string, weekdays: number[]): Date[]`
  - `weeklyGroupsFrom(entries: WeeklyEntryInput[]): WeeklyGroup[]`, onde `WeeklyEntryInput = { itemId: string | null; cardId: string | null; installmentId: string | null; installmentSeq: number | null; description: string | null; categoryId: string | null; plannedAmount: unknown; purchaseDate: Date | null }`

- [ ] **Step 1: Write the failing test**

Crie `tests/recurrence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { weekdayDatesInMonth, weeklyGroupsFrom } from "@/lib/recurrence";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("weekdayDatesInMonth", () => {
  it("terças (2) e sextas (5) de setembro/2026", () => {
    // set/2026 começa numa terça-feira (2026-09-01).
    expect(weekdayDatesInMonth("2026-09", [2, 5]).map(iso)).toEqual([
      "2026-09-01",
      "2026-09-04",
      "2026-09-08",
      "2026-09-11",
      "2026-09-15",
      "2026-09-18",
      "2026-09-22",
      "2026-09-25",
      "2026-09-29",
    ]);
  });

  it("fevereiro bissexto inclui o dia 29 quando cai no dia da semana", () => {
    // 2028-02-29 é uma terça-feira.
    const datas = weekdayDatesInMonth("2028-02", [2]).map(iso);
    expect(datas[datas.length - 1]).toBe("2028-02-29");
  });

  it("sem dias da semana devolve lista vazia", () => {
    expect(weekdayDatesInMonth("2026-09", [])).toEqual([]);
  });

  it("datas são UTC à meia-noite", () => {
    expect(weekdayDatesInMonth("2026-09", [2])[0].toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("weeklyGroupsFrom", () => {
  const base = {
    itemId: null,
    cardId: null,
    installmentId: "g1",
    installmentSeq: null,
    description: "Diarista",
    categoryId: "cat-moradia",
    plannedAmount: "220.00",
    purchaseDate: new Date("2026-08-04T00:00:00Z"),
  };

  it("agrupa ocorrências e coleta os dias da semana usados", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, purchaseDate: new Date("2026-08-07T00:00:00Z") }, // sexta
      { ...base, purchaseDate: new Date("2026-08-11T00:00:00Z") }, // terça
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      installmentId: "g1",
      description: "Diarista",
      categoryId: "cat-moradia",
      weekdays: [2, 5],
    });
  });

  it("amount vem da ocorrência mais recente do mês", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, purchaseDate: new Date("2026-08-28T00:00:00Z"), plannedAmount: "240.00" },
    ]);
    expect(grupos[0].amount).toBe(240);
  });

  it("ignora conta fixa (tem itemId), parcelamento (tem seq), cartão e sem data", () => {
    expect(
      weeklyGroupsFrom([
        { ...base, itemId: "item-1" },
        { ...base, installmentId: "g2", installmentSeq: 1 },
        { ...base, installmentId: "g3", cardId: "card-1" },
        { ...base, installmentId: "g4", purchaseDate: null },
        { ...base, installmentId: "g5", description: null },
      ]),
    ).toEqual([]);
  });

  it("dois grupos distintos saem separados", () => {
    const grupos = weeklyGroupsFrom([
      base,
      { ...base, installmentId: "g2", description: "Aula de inglês", purchaseDate: new Date("2026-08-05T00:00:00Z") },
    ]);
    expect(grupos.map((g) => g.installmentId).sort()).toEqual(["g1", "g2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/recurrence.test.ts`
Expected: FAIL — `weekdayDatesInMonth`/`weeklyGroupsFrom` não são exportados.

- [ ] **Step 3: Write minimal implementation**

Em `lib/recurrence.ts`, após `createWeekdayRecurrence`:

```ts
/** Um grupo de recorrência semanal como ele aparece num mês. */
export type WeeklyGroup = {
  installmentId: string;
  description: string;
  categoryId: string | null;
  /** Valor por ocorrência, em reais (o da ocorrência mais recente do mês). */
  amount: number;
  /** Dias da semana usados no mês (0=dom … 6=sáb), ordenados. */
  weekdays: number[];
};

/** Lançamento como vem do banco, no mínimo que os helpers precisam. */
export type WeeklyEntryInput = {
  itemId: string | null;
  cardId: string | null;
  installmentId: string | null;
  installmentSeq: number | null;
  description: string | null;
  categoryId: string | null;
  plannedAmount: unknown;
  purchaseDate: Date | null;
};

/** Datas do mês (YYYY-MM) que caem nos dias da semana pedidos, em UTC. */
export function weekdayDatesInMonth(month: string, weekdays: number[]): Date[] {
  if (weekdays.length === 0) return [];
  const wanted = new Set(weekdays);
  const [y, m] = month.split("-").map(Number);
  const out: Date[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // último dia do mês
  for (let day = 1; day <= last; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (wanted.has(d.getUTCDay())) out.push(d);
  }
  return out;
}

/**
 * Extrai os grupos de recorrência semanal de um mês. Marcador: sem item, sem
 * cartão, com installmentId e SEM installmentSeq — parcelamentos sempre
 * gravam seq, então não se confundem com recorrência.
 */
export function weeklyGroupsFrom(entries: WeeklyEntryInput[]): WeeklyGroup[] {
  const byGroup = new Map<string, { last: Date; group: WeeklyGroup; days: Set<number> }>();
  for (const e of entries) {
    if (e.itemId || e.cardId || !e.installmentId || e.installmentSeq !== null) continue;
    if (!e.purchaseDate || !e.description) continue;
    const amount = Number(String(e.plannedAmount));
    if (!Number.isFinite(amount)) continue;
    const found = byGroup.get(e.installmentId);
    if (!found) {
      byGroup.set(e.installmentId, {
        last: e.purchaseDate,
        days: new Set([e.purchaseDate.getUTCDay()]),
        group: {
          installmentId: e.installmentId,
          description: e.description,
          categoryId: e.categoryId,
          amount,
          weekdays: [],
        },
      });
      continue;
    }
    found.days.add(e.purchaseDate.getUTCDay());
    if (e.purchaseDate.getTime() > found.last.getTime()) {
      found.last = e.purchaseDate;
      found.group.amount = amount; // o valor mais recente manda
    }
  }
  return [...byGroup.values()].map(({ group, days }) => ({
    ...group,
    weekdays: [...days].sort((a, b) => a - b),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/recurrence.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/recurrence.ts tests/recurrence.test.ts
git commit -m "feat: helpers de grupo semanal e datas por dia da semana"
```

---

### Task 2: Cópia de mês estende recorrências semanais

**Files:**
- Modify: `app/(app)/mes/actions.ts` (`copyPreviousMonth` e `copyYearAgoMonthAction`)

**Interfaces:**
- Consumes: `weeklyGroupsFrom`, `weekdayDatesInMonth`, `type WeeklyGroup` (Task 1), via import de `@/lib/recurrence` (o arquivo já importa `createRecurrence` etc. de lá).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Função auxiliar compartilhada pelas duas actions**

Em `app/(app)/mes/actions.ts`, acrescente `weeklyGroupsFrom` e `weekdayDatesInMonth` ao import de `@/lib/recurrence` e defina, acima de `copyPreviousMonth`:

```ts
/**
 * Recria no mês de destino as recorrências SEMANAIS presentes nos lançamentos
 * de origem (a Diarista e afins não têm Item, então o laço das contas fixas
 * não as alcança). Reaproveita o installmentId para o grupo seguir coeso e
 * pula o grupo que já tenha qualquer lançamento no destino (idempotência).
 * Devolve quantas ocorrências criou.
 */
async function copyWeeklyGroups(
  tx: Prisma.TransactionClient,
  sourceEntries: Parameters<typeof weeklyGroupsFrom>[0],
  targetMonth: string,
): Promise<number> {
  const groups = weeklyGroupsFrom(sourceEntries);
  if (groups.length === 0) return 0;
  const target = monthToDate(targetMonth);
  let created = 0;
  for (const g of groups) {
    const existing = await tx.monthlyEntry.count({
      where: { installmentId: g.installmentId, month: target },
    });
    if (existing > 0) continue;
    const dates = weekdayDatesInMonth(targetMonth, g.weekdays);
    if (dates.length === 0) continue;
    await tx.monthlyEntry.createMany({
      data: dates.map((purchaseDate) => ({
        installmentId: g.installmentId,
        description: g.description,
        categoryId: g.categoryId,
        month: target,
        plannedAmount: g.amount,
        purchaseDate,
      })),
    });
    created += dates.length;
  }
  return created;
}
```

Acrescente o import do tipo do cliente Prisma no topo do arquivo, se ainda não existir:

```ts
import type { Prisma } from "@prisma/client";
```

- [ ] **Step 2: Chamar em `copyPreviousMonth`**

Dentro da `prisma.$transaction` de `copyPreviousMonth`, **depois** do `for (const e of [...prevEntries, ...intervalEntries]) { … }`, acrescente:

```ts
      copied += await copyWeeklyGroups(tx, prevEntries, month);
```

(`month` é a string `YYYY-MM` que a action recebe; `copied` já existe e é retornado.)

- [ ] **Step 3: Chamar em `copyYearAgoMonthAction`**

Essa action busca `sourceEntries` com `itemId: { not: null }` — o filtro exclui justamente as semanais. Faça duas mudanças:

1. Depois da busca existente de `sourceEntries`, acrescente uma segunda busca só das semanais (não mexa na primeira, nem na checagem `sourceEntries.length === 0`):

```ts
  const looseSource = await prisma.monthlyEntry.findMany({
    where: { month: source, itemId: null, cardId: null, installmentId: { not: null }, installmentSeq: null },
  });
```

2. Dentro da `prisma.$transaction`, depois do laço `for (const e of sourceEntries) { … }`:

```ts
      copied += await copyWeeklyGroups(tx, looseSource, month);
```

**Atenção à mensagem de erro:** a checagem `if (sourceEntries.length === 0) return { error: … }` acontece ANTES da transação e olha só as contas fixas. Troque-a para considerar também as semanais:

```ts
  if (sourceEntries.length === 0 && looseSource.length === 0)
    return { error: `Nenhuma conta fixa em ${sourceMonth} para copiar.` };
```

- [ ] **Step 4: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes em outros arquivos).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/mes/actions.ts"
git commit -m "fix: cópia de mês recria recorrências semanais"
```

---

### Task 3: Duração configurável da recorrência

**Files:**
- Modify: `lib/validators.ts` (`purchaseSchema`)
- Modify: `app/(app)/mes/actions.ts` (`createPurchase`: ramo semanal e ramo mensal)
- Modify: `app/(app)/mes/PurchaseDialog.tsx`
- Test: `tests/validators.test.ts`

**Interfaces:**
- Consumes: `createWeekdayRecurrence({ months })` e `createRecurrence({ months })` (já existentes em `@/lib/recurrence`; em `createRecurrence`, `months` é o número de OCORRÊNCIAS).
- Produces: campo `recurrenceMonths` no `purchaseSchema` (inteiro 2..60, padrão 12).

- [ ] **Step 1: Write the failing test**

Acrescente a `tests/validators.test.ts`, dentro do `describe("validators", …)`:

```ts
  it("purchaseSchema usa 12 meses quando a duração não vem no FormData", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Diarista",
      amount: 220,
      date: "2026-08-04",
      recurring: "on",
      intervalMonths: "0",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(12);
  });

  it("purchaseSchema aceita duração de 24 meses", () => {
    const parsed = purchaseSchema.safeParse({
      description: "Diarista",
      amount: 220,
      date: "2026-08-04",
      recurring: "on",
      intervalMonths: "0",
      recurrenceMonths: "24",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.recurrenceMonths).toBe(24);
  });

  it("purchaseSchema rejeita duração fora de 2..60", () => {
    const campos = { description: "X", amount: 10, date: "2026-08-04", recurring: "on", intervalMonths: "1" };
    expect(purchaseSchema.safeParse({ ...campos, recurrenceMonths: "1" }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...campos, recurrenceMonths: "61" }).success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/validators.test.ts`
Expected: FAIL — `recurrenceMonths` não existe no schema (o valor sai `undefined` e o caso 1/61 passa).

- [ ] **Step 3: Campo no schema**

Em `lib/validators.ts`, dentro de `purchaseSchema`, logo após `intervalMonths`:

```ts
  // Duração da recorrência em MESES (campo ausente/vazio → 12).
  recurrenceMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 12 : v),
    z.coerce.number().int().min(2, "Duração entre 2 e 60 meses").max(60, "Duração entre 2 e 60 meses"),
  ),
```

- [ ] **Step 4: Usar a duração nas duas criações**

Em `app/(app)/mes/actions.ts`, dentro de `createPurchase`:

1. No ramo semanal (`if (recurring && parsed.data.intervalMonths === 0)`), acrescente `months` à chamada:

```ts
    const { count } = await createWeekdayRecurrence({
      description,
      amount,
      weekdays,
      startISO: date,
      months: parsed.data.recurrenceMonths,
      categoryId,
    });
```

2. No ramo `if (recurring)` seguinte, a chamada de `createRecurrence` passa a informar as ocorrências correspondentes à duração escolhida:

```ts
    const interval = Math.max(1, parsed.data.intervalMonths);
    const { count } = await createRecurrence({
      name: description,
      amount,
      startMonth: date.slice(0, 7),
      categoryId,
      dueDay: Number(date.slice(8, 10)),
      intervalMonths: parsed.data.intervalMonths,
      months: Math.max(2, Math.round(parsed.data.recurrenceMonths / interval)),
    });
```

Preserve os demais argumentos que a chamada já tiver no arquivo (ex.: `businessDay`), acrescentando apenas `months`.

- [ ] **Step 5: Campo no diálogo**

Em `app/(app)/mes/PurchaseDialog.tsx`:

1. Ao lado dos estados existentes (`recurring`, `frequency`), acrescente:

```tsx
  const [durationMonths, setDurationMonths] = useState("12");
```

2. Dentro do bloco `{recurring && (<> … </>)}`, **depois** do campo "Frequência" e **antes** do bloco `{frequency === "0" && …}`:

```tsx
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchase-duration">Duração (meses)</Label>
                <Input
                  id="purchase-duration"
                  type="number"
                  name="recurrenceMonths"
                  min={2}
                  max={60}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Por quantos meses provisionar. Depois desse prazo, use “Copiar mês anterior”.
                </p>
              </div>
```

3. No texto de ajuda do bloco semanal, troque `pelos próximos 12 meses.` por:

```tsx
                    Um lançamento por ocorrência (com a data de cada dia), a partir da data da
                    compra, pelos próximos {durationMonths} meses.
```

- [ ] **Step 6: Run tests**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde (inclusive os 3 testes novos de validator), tsc limpo, lint 0 erros.

- [ ] **Step 7: Commit**

```bash
git add lib/validators.ts "app/(app)/mes/actions.ts" "app/(app)/mes/PurchaseDialog.tsx" tests/validators.test.ts
git commit -m "feat: duração configurável ao criar recorrência"
```

---

### Task 4: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7.

- [ ] **Step 3: verificação funcional contra o schema `e2e` (isolado, nunca o banco real)**

Com o servidor e2e de pé (`npm run e2e` já o sobe e derruba; para inspeção manual use `DATABASE_SCHEMA=e2e APP_PASSWORD=e2e-senha-teste AUTH_SECRET=e2e-secret-apenas-para-testes-0123456789abcdef npx next start -p 3193` após `npx tsx scripts/e2e-reset-db.ts`), via Playwright:

1. Em `/mes?month=2030-01`, "Lançar compra": descrição `Faxina`, valor `150,00`, marcar recorrência, frequência **Semanal**, dias **ter** e **sex**, **Duração 3**, data `2030-01-08` → confirmar toast e que existem ocorrências em jan, fev e mar/2030 e **nenhuma** em abr/2030 (prova a duração; hoje seriam 12 meses).
2. Ir a `/mes?month=2030-04` e clicar "Copiar mês anterior" → as ocorrências de `Faxina` aparecem em abr/2030 nos mesmos dias da semana (prova a cópia).
3. Clicar "Copiar mês anterior" de novo → a contagem de `Faxina` em abr/2030 **não muda** (prova a idempotência).
4. Screenshot de cada passo e anexo ao relatório.

Como o schema `e2e` é recriado do zero pelo `scripts/e2e-reset-db.ts`, não há limpeza a fazer depois — e o banco real não é tocado.
