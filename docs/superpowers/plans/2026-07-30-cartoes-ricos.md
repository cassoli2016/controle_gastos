# Cards de Cartão Ricos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards da tela Cartões com limite + barra de uso estimado, chip fecha/vence e próximas faturas por cartão; limite auto-preenchido pela importação da fatura.

**Architecture:** Migration nullable única (`card_limit`); helpers puros testados (`usageTone`, `estimateCardUsage`, parser `limitCents`); página Cartões ganha 2 agregações e o card enriquecido. Reuso de `progressPct` e `upcomingCardCommitments`.

**Tech Stack:** Prisma 7 (migration via DIRECT_URL; se `migrate dev` recusar non-interactive, SQL manual + `migrate deploy` — padrão já usado no projeto), Next.js, vitest.

**Spec:** `docs/superpowers/specs/2026-07-30-cartoes-ricos-design.md`

## Global Constraints

- Dinheiro em centavos; pt-BR acentuado; commits convencionais pt-BR com rodapé padrão da sessão; branch `feat/cartoes-ricos`.
- Migration é ADITIVA e nullable — segura contra o banco de produção.

---

### Task 1: Migration `card_limit` + validator + forms

**Files:**
- Modify: `prisma/schema.prisma` (CreditCard), `lib/validators.ts` (cardSchema), `app/(app)/cartoes/NewCardForm.tsx`, `app/(app)/cartoes/CardRow.tsx`
- Test: `tests/validators.test.ts` (se cardSchema tiver testes; senão, cobertura via preprocess igual ao closingDay)

**Interfaces:**
- Produces: `CreditCard.limitAmount: Decimal | null`; `cardSchema` aceita `limitAmount` (reais, opcional).

- [ ] **Step 1:** No schema, após `dueDay Int?`:

```prisma
  // Limite de compras do cartão (para a barra de uso na tela Cartões).
  // Auto-atualizado pela importação da fatura; editável no form.
  limitAmount Decimal? @db.Decimal(12, 2)
```

- [ ] **Step 2:** `npx prisma migrate dev --name card_limit` (se recusar non-interactive: criar a pasta da migration com `ALTER TABLE "CreditCard" ADD COLUMN "limitAmount" DECIMAL(12,2);` e `npx prisma migrate deploy`); `npx prisma generate`.
- [ ] **Step 3:** `cardSchema` ganha (mesmo padrão do closingDay):

```ts
  // Limite em REAIS (CurrencyInput manda "1.234,56"); vazio vira null.
  limitAmount: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z
      .string()
      .transform((s, ctx) => {
        try {
          return parseBRLToCents(s) / 100;
        } catch {
          ctx.addIssue({ code: "custom", message: "Limite inválido" });
          return z.NEVER;
        }
      })
      .nullable(),
  ),
```

(Conferir como o CurrencyInput submete o valor — se mandar número decimal com ponto, usar `z.coerce.number().positive().nullable()`; olhar `components/ui/currency-input.tsx` e o uso em `prepaymentSchema`, que usa `z.coerce.number()`.)

- [ ] **Step 4:** Actions `createCard`/`updateCard` passam a incluir `limitAmount: formData.get("limitAmount")` no safeParse. Forms: campo "Limite (opcional)" com `CurrencyInput` (NewCardForm) e no dialog de editar do CardRow (`defaultCents` = valor atual).
- [ ] **Step 5:** `npm test && npx tsc --noEmit` verdes → commit `feat: limite do cartão (schema, validação e formulários)`.

---

### Task 2: Helpers puros — `usageTone` + `estimateCardUsage` + parser `limitCents`

**Files:**
- Create: `lib/card-usage.ts`
- Modify: `lib/bradesco-fatura.ts`
- Test: `tests/card-usage.test.ts`, `tests/bradesco-fatura.test.ts`

**Interfaces:**
- Produces:
  - `estimateCardUsage(entries: { cents: number; paid: boolean }[]): number` — soma dos não pagos.
  - `usageTone(pct: number): "emerald" | "amber" | "rose"` — <60 / <85 / ≥85.
  - `BradescoFatura.limitCents: number | null` (âncora `/Limite de compras\s*R\$\s*([\d.,]+)/`).

- [ ] **Step 1: Testes que falham**

`tests/card-usage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { estimateCardUsage, usageTone } from "@/lib/card-usage";

describe("estimateCardUsage", () => {
  it("soma só faturas não pagas", () =>
    expect(
      estimateCardUsage([
        { cents: 100000, paid: true },
        { cents: 50000, paid: false },
        { cents: 25000, paid: false },
      ]),
    ).toBe(75000));
  it("vazio → 0", () => expect(estimateCardUsage([])).toBe(0));
});

describe("usageTone", () => {
  it("faixas", () => {
    expect(usageTone(0)).toBe("emerald");
    expect(usageTone(59)).toBe("emerald");
    expect(usageTone(60)).toBe("amber");
    expect(usageTone(84)).toBe("amber");
    expect(usageTone(85)).toBe("rose");
    expect(usageTone(100)).toBe("rose");
  });
});
```

`tests/bradesco-fatura.test.ts`, no describe de metadados:

```ts
  it("limite de compras", () => expect(fatura.limitCents).toBe(1350000));
```

- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar (`lib/card-usage.ts` com os dois helpers e doc curta; parser adiciona `limitCents` ao type e ao return via `money(text, LIMIT_RE)`). **Step 4:** PASS. **Step 5:** Commit `feat: uso estimado do limite e limite lido da fatura`.

---

### Task 3: Import auto-atualiza o limite + preview mostra

**Files:**
- Modify: `lib/bradesco-import.ts`, `app/(app)/cartoes/actions.ts` (FaturaPreview + preview action), `app/(app)/cartoes/ImportFaturaDialog.tsx`

**Interfaces:**
- `applyBradescoFaturaImport` ganha `limitCents: number | null` em opts; quando não-nulo: `prisma.creditCard.update({ where: { id: card.id }, data: { limitAmount: centsToNumber(limitCents) } })`.
- `FaturaPreview.limitCents: number | null`; payload zod ganha `limitCents: z.number().int().nullable()`; dialog envia e mostra no cabeçalho do preview (`· limite {formatCents(limitCents)}` quando presente).

- [ ] **Step 1:** Aplicar as três pontas (lib, actions, dialog). **Step 2:** `npm test && npx tsc --noEmit` verdes. Commit `feat: importação da fatura atualiza o limite do cartão`.

---

### Task 4: Card enriquecido na tela Cartões

**Files:**
- Modify: `app/(app)/cartoes/page.tsx`

**Interfaces:**
- Consumes: `estimateCardUsage`, `usageTone`, `progressPct`, `upcomingCardCommitments`, `todayISOInSaoPaulo`, `formatCompetencia`, `decimalToCents`.

- [ ] **Step 1: Agregações** — no Promise.all, buscar também:

```ts
    // Uso do limite: consolidados NÃO PAGOS do mês corrente em diante.
    prisma.monthlyEntry.findMany({
      where: { cardId: { not: null }, paid: false, month: { gte: monthToDate(todayISOInSaoPaulo().slice(0, 7)) } },
      select: { cardId: true, plannedAmount: true },
    }),
    // Próximas faturas (3 meses após o mês exibido), por cartão.
    prisma.monthlyEntry.findMany({
      where: { cardId: { not: null }, month: { in: nextThreeMonths.map(monthToDate) } },
      select: { cardId: true, month: true, plannedAmount: true },
    }),
```

com `const nextThreeMonths = [1, 2, 3].map((d) => { const x = monthToDate(month); x.setUTCMonth(x.getUTCMonth() + d); return monthStringFromDate(x); });` antes do Promise.all.

- [ ] **Step 2: Por cartão em `invoices`:**

```ts
    const usedCents = estimateCardUsage(
      openEntries.filter((e) => e.cardId === card.id).map((e) => ({ cents: decimalToCents(String(e.plannedAmount)), paid: false })),
    );
    const limitCents = card.limitAmount === null ? null : decimalToCents(String(card.limitAmount));
    const upcoming = upcomingCardCommitments(
      upcomingRows.filter((r) => r.cardId === card.id).map((r) => ({ month: monthStringFromDate(r.month), plannedCents: decimalToCents(String(r.plannedAmount)) })),
    );
```

- [ ] **Step 3: UI do card:**
  - Header: chip fecha/vence após o nome (span `text-xs text-muted-foreground rounded-full border px-2 py-0.5`, texto montado só com as partes presentes: `Fecha 27 · vence 10`).
  - Barra de uso (quando `limitCents`): abaixo do StatCard — `pct = progressPct(usedCents, limitCents)`, `tone = usageTone(pct)`, barra h-1.5 com `bg-emerald-500|bg-amber-500|bg-rose-500` e trilha `bg-muted`; linha `text-xs text-muted-foreground`: `{formatCents(usedCents)} de {formatCents(limitCents)} · disponível {formatCents(limitCents - usedCents)} (estimado)`.
  - Próximas faturas (quando `upcoming.length > 0`): bloco `border-t pt-2` com título `text-xs uppercase text-muted-foreground` "Próximas faturas" e linhas `flex justify-between text-sm` (`formatCompetencia` × `formatCents`).

- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint` verdes. Commit `feat: cards de cartão com limite, vencimentos e próximas faturas`.

---

### Task 5: Verificação visual + suíte + PR

- [ ] **Step 1:** Bypass auth (padrão), build, server, screenshots `/cartoes?month=2026-08` desktop+mobile+dark (aguardar 1.8s). Checklist: chip "Fecha 27 · vence 10"; barra de uso do Bradesco (limite ainda null → sem barra ANTES de reimportar; para ver a barra, definir o limite via "Editar" OU reimportar a fatura — no teste visual, editar o cartão Bradesco com limite R$ 13.500,00 via UI Playwright ou script). Próximas faturas listadas nos dois cartões.
- [ ] **Step 2:** Reverter patches, limpar, suíte completa (`npm test && npm run lint && npm run build`).
- [ ] **Step 3:** Push + PR (resumo + como foi testado + rodapé padrão).
