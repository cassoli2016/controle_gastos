# Fatura por vencimento + Panorama sempre em dia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A competência de qualquer cobrança no cartão passa a ser o mês em que a fatura **vence** (não em que fecha), e o Panorama reflete pagamento parcial e nunca mais serve dado velho.

**Architecture:** Uma única função pura (`lib/fatura.ts::faturaMonth`) decide a competência a partir de fechamento + vencimento; todo o app já rotea por ela via `cardTargetMonth`, então a correção alcança UI, bot do Telegram, CSV, assinaturas e antecipação de uma vez. `CreditCard` ganha `dueDay`. No Panorama, `lib/matrix.ts` passa a expor `paidCount` por célula (estado parcial) e todas as Server Actions passam a chamar um único `revalidateFinance()`.

**Tech Stack:** Next.js 16.2.10 (App Router, Server Actions), React 19.2, Prisma 7.8 + Postgres (driver adapter `@prisma/adapter-pg`), Zod 4, Tailwind 4 + shadcn/ui, Vitest 4 (unit), Playwright (e2e).

## Global Constraints

- **Leia o guia do Next em `node_modules/next/dist/docs/` antes de escrever código que toque APIs do framework** (`AGENTS.md`: esta versão do Next tem breaking changes em relação ao conhecimento pré-treinado).
- Dinheiro em **centavos inteiros** no domínio; `Decimal` do Prisma sempre convertido com `decimalToCents(String(valor))` e escrito com `centsToNumber(cents)` (`lib/money.ts`).
- Datas de mês são `"YYYY-MM"` (string) e `@db.Date` em UTC via `monthToDate`/`monthStringFromDate` (`lib/dates.ts`). Datas de dia são `"YYYY-MM-DD"`, materializadas com `new Date(iso + "T00:00:00Z")`.
- Comentários e textos de UI em **português do Brasil**, com acentuação correta. Comentários explicam o *porquê*, não o *quê* — siga a densidade dos arquivos vizinhos.
- Server Actions retornam `ActionState` (`{ error?, ok?, count? }`) e são consumidas via `useActionState` + `useActionToast`.
- Regra de negócio validada: **Bradesco Amazon fecha 27 e vence 10** (paga no mês seguinte ao fechamento); **Nubank fecha 4 e vence 10** (paga no mesmo mês do fechamento). Ambos recebem `dueDay = 10`.
- `dueDay == closingDay` conta como "vence no mês seguinte".
- Cartão sem `dueDay` mantém exatamente o comportamento atual; cartão sem `closingDay` continua caindo no `fallbackMonth` do chamador.
- Nunca commitar patches temporários de bypass de auth (`middleware.ts`, `app/(app)/layout.tsx`).

---

### Task 1: Regra de fatura por vencimento (função pura)

**Files:**
- Modify: `lib/fatura.ts:1-46`
- Test: `tests/fatura.test.ts:1-21` (adiciona describes novos, não altera os existentes)

**Interfaces:**
- Consumes: `monthStringFromDate(d: Date): string` de `@/lib/dates`.
- Produces:
  - `faturaMonth(dateISO: string, closingDay: number, dueDay?: number | null): string | null`
  - `cardTargetMonth(card: { closingDay: number | null; dueDay?: number | null; id?: string; name?: string }, dateISO: string | undefined, fallbackMonth: string): string`

- [ ] **Step 1: Escreva os testes que falham**

Adicione em `tests/fatura.test.ts`. Troque a linha 2 do arquivo para importar também `cardTargetMonth`:

```ts
import { faturaMonth, cardTargetMonth, todayISOInSaoPaulo, nthBusinessDay } from "@/lib/fatura";
```

E acrescente ao fim do arquivo:

```ts
describe("faturaMonth com vencimento — Bradesco Amazon (fecha 27, vence 10)", () => {
  it("compra até o fechamento é paga no mês seguinte", () => {
    expect(faturaMonth("2026-07-01", 27, 10)).toBe("2026-08");
    expect(faturaMonth("2026-07-25", 27, 10)).toBe("2026-08");
    expect(faturaMonth("2026-07-27", 27, 10)).toBe("2026-08");
  });
  it("compra após o fechamento pula uma fatura", () => {
    expect(faturaMonth("2026-07-28", 27, 10)).toBe("2026-09");
    expect(faturaMonth("2026-07-31", 27, 10)).toBe("2026-09");
  });
  it("virada de ano", () => {
    expect(faturaMonth("2026-12-20", 27, 10)).toBe("2027-01");
    expect(faturaMonth("2026-12-28", 27, 10)).toBe("2027-02");
  });
});

describe("faturaMonth com vencimento — Nubank (fecha 4, vence 10)", () => {
  it("vencimento depois do fechamento mantém o mês do fechamento", () => {
    expect(faturaMonth("2026-07-03", 4, 10)).toBe("2026-07");
    expect(faturaMonth("2026-07-04", 4, 10)).toBe("2026-07");
    expect(faturaMonth("2026-07-25", 4, 10)).toBe("2026-08");
  });
  it("resultado idêntico ao de antes do vencimento existir", () => {
    expect(faturaMonth("2026-07-25", 4, 10)).toBe(faturaMonth("2026-07-25", 4));
    expect(faturaMonth("2026-07-03", 4, 10)).toBe(faturaMonth("2026-07-03", 4));
  });
});

describe("faturaMonth — bordas do vencimento", () => {
  it("vencimento ausente ou nulo mantém o comportamento antigo", () => {
    expect(faturaMonth("2026-07-25", 27)).toBe("2026-07");
    expect(faturaMonth("2026-07-25", 27, null)).toBe("2026-07");
  });
  it("vencimento igual ao fechamento conta como mês seguinte", () => {
    expect(faturaMonth("2026-07-25", 27, 27)).toBe("2026-08");
  });
  it("data inválida continua null mesmo com vencimento", () => {
    expect(faturaMonth("25/07/2026", 27, 10)).toBeNull();
    expect(faturaMonth("2026-13-01", 27, 10)).toBeNull();
  });
});

describe("cardTargetMonth", () => {
  const bradesco = { closingDay: 27, dueDay: 10 };
  it("aplica fechamento + vencimento", () => {
    expect(cardTargetMonth(bradesco, "2026-07-25", "2026-07")).toBe("2026-08");
  });
  it("cartão sem fechamento cai no mês-fallback", () => {
    expect(cardTargetMonth({ closingDay: null, dueDay: 10 }, "2026-07-25", "2026-07")).toBe("2026-07");
  });
  it("data inválida cai no mês-fallback", () => {
    expect(cardTargetMonth(bradesco, "25/07/2026", "2026-07")).toBe("2026-07");
  });
});
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `npx vitest run tests/fatura.test.ts`
Expected: FAIL — os casos com 3º argumento retornam `"2026-07"` em vez de `"2026-08"` (o parâmetro `dueDay` é ignorado porque ainda não existe).

- [ ] **Step 3: Implemente a regra**

Substitua o topo de `lib/fatura.ts` (do comentário de cabeçalho até o fim de `cardTargetMonth`, linhas 1-46) por:

```ts
/**
 * Regras de fatura de cartão: a compra entra no ciclo que ainda não fechou, e
 * a competência do lançamento é o mês em que esse ciclo VENCE — o mês em que o
 * dinheiro sai. Quando o vencimento cai antes do fechamento no calendário
 * (Bradesco: fecha 27, vence 10), a fatura fechada só é paga no mês seguinte.
 */

import { monthStringFromDate } from "@/lib/dates";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Mês em que a fatura de uma compra será paga.
 * "2026-07-25" + fechamento 27 + vencimento 10 → "2026-08" (fecha 27/07, vence
 * 10/08). Sem vencimento, a competência é o próprio mês do fechamento —
 * comportamento anterior, preservado para cartão que não tem o campo
 * preenchido. Retorna null para data inválida.
 */
export function faturaMonth(dateISO: string, closingDay: number, dueDay?: number | null): string | null {
  const m = ISO_DATE_RE.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Passo 1: qual ciclo captura a compra — o do próprio mês se ela veio até o
  // fechamento, senão o do mês seguinte.
  // Passo 2: em que mês esse ciclo vence — vencimento <= fechamento significa
  // pagar no mês seguinte ao fechamento (uma fatura não fecha e vence no mesmo
  // dia).
  const monthsAhead = (day <= closingDay ? 0 : 1) + (dueDay != null && dueDay <= closingDay ? 1 : 0);
  return monthStringFromDate(new Date(Date.UTC(year, month - 1 + monthsAhead, 1)));
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — despesas de texto do bot. */
export function todayISOInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Mês-alvo de uma cobrança no cartão: com dia de fechamento, a fatura correta
 * pela data (e pelo vencimento); sem fechamento, o mês-fallback informado.
 */
export function cardTargetMonth(
  // id/name opcionais: aceita CardRef inteiro sem brigar com literal freshness.
  card: { closingDay: number | null; dueDay?: number | null; id?: string; name?: string },
  dateISO: string | undefined,
  fallbackMonth: string,
): string {
  if (card.closingDay == null) return fallbackMonth;
  return faturaMonth(dateISO ?? todayISOInSaoPaulo(), card.closingDay, card.dueDay) ?? fallbackMonth;
}
```

`nthBusinessDay` (linhas 48-65) fica **inalterado** no fim do arquivo.

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `npx vitest run tests/fatura.test.ts`
Expected: PASS — inclusive os 4 describes que já existiam (`faturaMonth (fechamento dia 5)`, `todayISOInSaoPaulo`, `nthBusinessDay`).

- [ ] **Step 5: Rode a suíte inteira**

Run: `npm test`
Expected: PASS. `tests/card-subscription.test.ts` e `tests/csv-import.test.ts` usam a mesma função sem `dueDay` e continuam verdes.

- [ ] **Step 6: Commit**

```bash
git add lib/fatura.ts tests/fatura.test.ts
git commit -m "fix: fatura de cartão é roteada pelo mês do vencimento"
```

---

### Task 2: `CreditCard.dueDay` no modelo e em todo o domínio

**Files:**
- Modify: `prisma/schema.prisma:58-71` (model `CreditCard`)
- Create: `prisma/migrations/<timestamp>_card_due_day/migration.sql`
- Modify: `lib/validators.ts:38-52` (`cardSchema`)
- Modify: `lib/card-entry.ts:10` (`CardRef`), `:198`, `:219`
- Modify: `lib/card-subscription.ts:10` (`CardLike`), `:26` (`firstChargeFaturaMonth`)
- Modify: `app/(app)/cartoes/actions.ts:20-43` (create/update lêem o campo), `:57`, `:88`, `:110`
- Modify: `app/(app)/mes/actions.ts:311`, `:316`
- Modify: `app/api/telegram/route.ts:69`, `:222`, `:224`, `:501`
- Modify: `scripts/import-bradesco.ts:77`
- Test: `tests/card-subscription.test.ts` (adiciona um describe)

**Interfaces:**
- Consumes: `faturaMonth`/`cardTargetMonth` da Task 1.
- Produces:
  - `type CardRef = { id: string; name: string; closingDay: number | null; dueDay: number | null }` (exportado de `lib/card-entry.ts`)
  - `firstChargeFaturaMonth(card: { closingDay: number | null; dueDay?: number | null }, chargeDay: number, todayISO: string): string`
  - `cardSchema` passa a produzir `{ name, color, closingDay, dueDay }`

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `tests/card-subscription.test.ts`:

```ts
describe("firstChargeFaturaMonth com vencimento antes do fechamento (fecha 27, vence 10)", () => {
  const bradesco = { id: "b", name: "Bradesco Amazon", closingDay: 27, dueDay: 10 };
  it("cobrança dia 15, hoje 25/07: cobra 15/08 → fecha 27/08 → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 15, "2026-07-25")).toBe("2026-09");
  });
  it("cobrança dia 28, hoje 25/07: cobra 28/07 (após o fechamento) → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 28, "2026-07-25")).toBe("2026-09");
  });
  it("cobrança dia 3, hoje 25/07: cobra 03/08 → fecha 27/08 → vence 10/09", () => {
    expect(firstChargeFaturaMonth(bradesco, 3, "2026-07-25")).toBe("2026-09");
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npx vitest run tests/card-subscription.test.ts`
Expected: FAIL — retorna `"2026-08"` em vez de `"2026-09"` (o tipo do parâmetro ignora `dueDay`, então ele não chega em `cardTargetMonth`).

- [ ] **Step 3: Adicione o campo ao schema**

Em `prisma/schema.prisma`, dentro de `model CreditCard`, logo depois de `closingDay Int?`:

```prisma
  // Dia de vencimento da fatura (1-31): define em QUE MÊS a fatura fechada é
  // paga — e portanto a competência do lançamento. Vencimento <= fechamento
  // significa pagar no mês seguinte ao fechamento (Bradesco: fecha 27, vence
  // 10). null = competência é o próprio mês do fechamento.
  dueDay     Int?
```

- [ ] **Step 4: Gere a migration sem aplicar e acrescente o backfill**

Run: `npx prisma migrate dev --create-only --name card_due_day`

Abra o `migration.sql` gerado (`prisma/migrations/<timestamp>_card_due_day/migration.sql`) e acrescente ao fim:

```sql
-- Backfill dos cartões já cadastrados: Bradesco Amazon (fecha 27) e Nubank
-- (fecha 4) vencem ambos no dia 10. Em banco vazio (schema novo, schema "e2e"
-- dos testes) é no-op.
UPDATE "CreditCard" SET "dueDay" = 10 WHERE "closingDay" IS NOT NULL;
```

- [ ] **Step 5: Aplique a migration**

> A `DIRECT_URL` do `.env` aponta para o banco real — esta migration roda em produção, como as 16 anteriores do projeto.

Run: `npx prisma migrate dev`
Expected: `Your database is now in sync with your schema` e o client regenerado.

- [ ] **Step 6: Confirme o backfill**

`prisma db execute` não imprime linhas, então use um script descartável (o alias `@/` só resolve a partir de um arquivo, não com `tsx -e`). Crie `scripts/_check-cards.ts`:

```ts
// TEMPORÁRIO — deletar depois de conferir. Não commitar.
import "dotenv/config";
import { prisma } from "@/lib/prisma";

async function main() {
  const cards = await prisma.creditCard.findMany({ orderBy: { name: "asc" } });
  for (const c of cards) console.log(`${c.name}: fecha ${c.closingDay} · vence ${c.dueDay}`);
  await prisma.$disconnect();
}
main();
```

Run: `npx tsx scripts/_check-cards.ts && rm scripts/_check-cards.ts`
Expected:
```
Bradesco Amazon: fecha 27 · vence 10
Nubank: fecha 4 · vence 10
```

- [ ] **Step 7: Aceite o campo no validador**

Em `lib/validators.ts`, dentro de `cardSchema`, depois do bloco de `closingDay`:

```ts
  // Dia de vencimento da fatura (opcional): campo vazio vira null.
  dueDay: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce
      .number()
      .int("Dia de vencimento deve ser inteiro")
      .min(1, "Dia de vencimento entre 1 e 31")
      .max(31, "Dia de vencimento entre 1 e 31")
      .nullable(),
  ),
```

- [ ] **Step 8: Amplie os tipos de cartão**

`lib/card-entry.ts:10`:

```ts
export type CardRef = { id: string; name: string; closingDay: number | null; dueDay: number | null };
```

`lib/card-subscription.ts:10` — `dueDay` **obrigatório** aqui (e não opcional), justamente para o compilador acusar quem constrói o objeto sem ele:

```ts
type CardLike = { id: string; name?: string; closingDay: number | null; dueDay: number | null };
```

`lib/card-subscription.ts:26` (assinatura de `firstChargeFaturaMonth`) — aqui `dueDay` é opcional, porque os testes existentes passam cartões sem o campo:

```ts
export function firstChargeFaturaMonth(
  card: { closingDay: number | null; dueDay?: number | null },
  chargeDay: number,
  todayISO: string,
): string {
```

- [ ] **Step 9: Acrescente `dueDay` nos 12 pontos que constroem um cartão**

Run: `npx tsc --noEmit`
Expected: erros de `Property 'dueDay' is missing` — mas **atenção: o compilador não pega todos**. `cardTargetMonth` aceita `dueDay` como opcional, então o site de `app/(app)/cartoes/actions.ts:110` passa calado. Edite os 12 explicitamente:

| Arquivo:linha | de onde vem o `dueDay` |
|---|---|
| `app/(app)/mes/actions.ts:311` | `card.dueDay` |
| `app/(app)/mes/actions.ts:316` | `card.dueDay` |
| `app/(app)/cartoes/actions.ts:57` | `card.dueDay` |
| `app/(app)/cartoes/actions.ts:88` | `card.dueDay` |
| `app/(app)/cartoes/actions.ts:110` | `sub.card.dueDay` ⚠️ sem erro de tipo |
| `lib/card-entry.ts:198` | `tx.card.dueDay` |
| `lib/card-entry.ts:219` | `tx.card.dueDay` |
| `app/api/telegram/route.ts:69` | `card.dueDay` |
| `app/api/telegram/route.ts:222` | `matches[0].dueDay` |
| `app/api/telegram/route.ts:224` | `activeCards[0].dueDay` |
| `app/api/telegram/route.ts:501` | `actives[0].dueDay` |
| `scripts/import-bradesco.ts:77` | `card.dueDay` |

O padrão é sempre o mesmo:

```ts
// era:  { id: card.id, name: card.name, closingDay: card.closingDay }
// fica: { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay }
```

Rede de segurança — nenhum literal deve mencionar `closingDay` sem `dueDay` na mesma linha:

Run: `grep -rn "closingDay" app lib scripts --include=*.ts --include=*.tsx | grep -v dueDay`
Expected: **só** declarações de campo isoladas e leituras de formulário — `app/(app)/cartoes/CardRow.tsx` (`closingDay: number | null;` no tipo `Card`), `app/(app)/cartoes/actions.ts` (duas linhas `closingDay: formData.get("closingDay"),`), `lib/validators.ts` (`closingDay: z.preprocess(` e as mensagens de erro), `prisma/schema.prisma` não aparece (não é .ts). Nenhuma linha construindo `{ id: ..., name: ..., closingDay: ... }`.

- [ ] **Step 10: Leia o novo campo nos formulários de cartão**

Em `app/(app)/cartoes/actions.ts`, nas duas chamadas de `cardSchema.safeParse` (`createCard` em ~`:20` e `updateCard` em ~`:34`), acrescente a linha:

```ts
    dueDay: formData.get("dueDay"),
```

`prisma.creditCard.create({ data: parsed.data })` e `update({ ..., data: parsed.data })` passam a gravar o campo sem mais nenhuma mudança.

- [ ] **Step 11: Verifique tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; todos os testes passam, incluindo o novo describe de `firstChargeFaturaMonth`.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/validators.ts lib/card-entry.ts lib/card-subscription.ts app/\(app\)/cartoes/actions.ts app/\(app\)/mes/actions.ts app/api/telegram/route.ts scripts/import-bradesco.ts tests/card-subscription.test.ts
git commit -m "feat: cartão guarda o dia de vencimento da fatura"
```

---

### Task 3: Vencimento na interface de cartões e na tela Mês

**Files:**
- Modify: `app/(app)/cartoes/NewCardForm.tsx:53-67`
- Modify: `app/(app)/cartoes/CardRow.tsx:31-37` (tipo), `:64-73` (badge), `:165-180` (formulário)
- Modify: `app/(app)/mes/page.tsx:189`

**Interfaces:**
- Consumes: `cardSchema` com `dueDay` e `CreditCard.dueDay` (Task 2).
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Campo no formulário de novo cartão**

Em `app/(app)/cartoes/NewCardForm.tsx`, troque o bloco do `closingDay` (linhas 53-67) por:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-closing">Dia de fechamento da fatura (opcional)</Label>
            <Input
              id="new-card-closing"
              name="closingDay"
              type="number"
              min={1}
              max={31}
              placeholder="ex.: 27"
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Compra após o fechamento entra na fatura seguinte.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-due">Dia de vencimento da fatura (opcional)</Label>
            <Input
              id="new-card-due"
              name="dueDay"
              type="number"
              min={1}
              max={31}
              placeholder="ex.: 10"
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Define em que mês a fatura é paga. Vencimento antes do fechamento (fecha 27, vence 10) =
              fatura paga no mês seguinte.
            </p>
          </div>
```

- [ ] **Step 2: Campo, tipo e badge na linha de cartão**

Em `app/(app)/cartoes/CardRow.tsx`, no tipo `Card` (linha 35), acrescente depois de `closingDay`:

```ts
  dueDay: number | null;
```

No `statusBadge` (linhas 64-73), troque o conteúdo do primeiro `<Badge>`:

```tsx
  const statusBadge = (
    <div className="flex items-center gap-1.5">
      {card.closingDay !== null && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {card.dueDay !== null
            ? `Fecha ${card.closingDay} · vence ${card.dueDay}`
            : `Fecha dia ${card.closingDay}`}
        </Badge>
      )}
      <Badge variant={card.active ? "default" : "outline"}>{card.active ? "Ativo" : "Arquivado"}</Badge>
    </div>
  );
```

E no formulário de edição, depois do bloco do `closingDay` (que termina na linha 180), acrescente:

```tsx
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-card-due-${card.id}`}>Dia de vencimento da fatura (opcional)</Label>
              <Input
                id={`edit-card-due-${card.id}`}
                name="dueDay"
                type="number"
                min={1}
                max={31}
                placeholder="ex.: 10"
                defaultValue={card.dueDay ?? ""}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Define em que mês a fatura é paga. Vencimento antes do fechamento (fecha 27, vence 10) =
                fatura paga no mês seguinte.
              </p>
            </div>
```

- [ ] **Step 3: Coluna "Dia" do consolidado na tela Mês**

Em `app/(app)/mes/page.tsx`, troque a linha 189:

```ts
    dueDay: r.item?.dueDay ?? null,
```

por:

```ts
    // Consolidado do cartão não tem data de compra: o "Dia" útil ali é o
    // vencimento da fatura (antes ficava "—").
    dueDay: r.item?.dueDay ?? (r.purchaseDate === null ? r.card?.dueDay ?? null : null),
```

- [ ] **Step 4: Verifique tipos e build**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros. `app/(app)/cartoes/page.tsx` passa `card` inteiro do Prisma para `CardRow`, então o novo campo do tipo já é satisfeito.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/cartoes/NewCardForm.tsx app/\(app\)/cartoes/CardRow.tsx app/\(app\)/mes/page.tsx
git commit -m "feat: dia de vencimento no cadastro de cartão e na tela Mês"
```

---

### Task 4: `paidCount` por célula do Panorama

**Files:**
- Modify: `lib/matrix.ts:20-27` (tipo `MatrixCell`), `:58-80` (acumulação)
- Test: `tests/matrix.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `MatrixCell` ganha `paidCount: number` (quantas das `count` ocorrências estão pagas). `allPaid` continua existindo e equivale a `paidCount === count`.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/matrix.test.ts`, acrescente dentro do `describe("buildMatrix")` (depois do `it` de "células agregam ocorrências"):

```ts
  it("célula parcial: paidCount conta as pagas sem virar allPaid", () => {
    const diarista = m.sections.find((s) => s.categoryName === "Moradia")!.rows[0];
    expect(diarista.cells["2026-08"]).toMatchObject({ count: 2, paidCount: 1, allPaid: false });
  });

  it("nenhuma ocorrência paga: paidCount zero", () => {
    const nubank = m.sections.find((s) => s.categoryName === "Cartão/Compras")!.rows[0];
    expect(nubank.cells["2026-08"]).toMatchObject({ count: 1, paidCount: 0, allPaid: false });
  });

  it("todas pagas: paidCount igual a count e allPaid", () => {
    const todas = buildMatrix([
      { line: "Almoço", categoryName: "Alimentação", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 5000, paid: true, entryId: "a1", kind: "loose" as const },
      { line: "Almoço", categoryName: "Alimentação", categoryType: "EXPENSE" as const, monthISO: "2026-08", cents: 5000, paid: true, entryId: "a2", kind: "loose" as const },
    ]);
    expect(todas.sections[0].rows[0].cells["2026-08"]).toMatchObject({ count: 2, paidCount: 2, allPaid: true });
  });
```

- [ ] **Step 2: Rode os testes e confirme que falham**

Run: `npx vitest run tests/matrix.test.ts`
Expected: FAIL — `paidCount` é `undefined` nos três novos casos.

- [ ] **Step 3: Acumule `paidCount`**

Em `lib/matrix.ts`, no tipo `MatrixCell` (linhas 20-27), acrescente depois de `allPaid`:

```ts
  /** Quantas das `count` ocorrências estão pagas — baixa parcial da célula. */
  paidCount: number;
```

E no laço de `buildMatrix` (linhas 65-71), troque a criação da célula e a acumulação por:

```ts
    const cell =
      row.cells[e.monthISO] ?? { cents: 0, allPaid: true, paidCount: 0, count: 0, entries: [], kind: e.kind };
    cell.cents += e.cents;
    cell.allPaid = cell.allPaid && e.paid;
    if (e.paid) cell.paidCount += 1;
    cell.count += 1;
```

- [ ] **Step 4: Rode os testes e confirme que passam**

Run: `npx vitest run tests/matrix.test.ts`
Expected: PASS, incluindo os casos que já existiam.

- [ ] **Step 5: Commit**

```bash
git add lib/matrix.ts tests/matrix.test.ts
git commit -m "feat: célula do Panorama conta ocorrências pagas"
```

---

### Task 5: Célula parcial em âmbar no Panorama

**Files:**
- Modify: `app/(app)/panorama/CellAction.tsx:17-121`
- Modify: `app/(app)/panorama/page.tsx:56-58` (texto de ajuda), `:166-176` (props da célula)

**Interfaces:**
- Consumes: `MatrixCell.paidCount` (Task 4); `setEntriesPaid`/`updateEntryValue` de `app/(app)/mes/actions.ts` (já existentes).
- Produces: `CellAction` passa a exigir a prop `paidCount: number`.

- [ ] **Step 1: Passe `paidCount` para a célula**

Em `app/(app)/panorama/page.tsx`, no `<CellAction ... />` (linhas 167-175), acrescente depois de `allPaid={cell.allPaid}`:

```tsx
                    paidCount={cell.paidCount}
```

E troque o texto de ajuda (linhas 56-58) por:

```tsx
        <p className="text-sm text-muted-foreground">
          Todos os meses lado a lado · verde = pago · âmbar = parcial · clique no valor para editar ou dar
          baixa
        </p>
```

- [ ] **Step 2: Três estados na célula**

Em `app/(app)/panorama/CellAction.tsx`, acrescente `paidCount` à assinatura do componente — na lista de props desestruturadas (linha ~19, depois de `allPaid`) e no tipo (linha ~22, depois de `allPaid: boolean`):

```tsx
export function CellAction({
  cents,
  allPaid,
  paidCount,
  count,
  entries,
  kind,
  income,
  monthLabel,
  line,
}: {
  cents: number;
  allPaid: boolean;
  /** Ocorrências já pagas da célula — `0 < paidCount < count` é baixa parcial. */
  paidCount: number;
  count: number;
  entries: CellEntry[];
  kind: "item" | "card" | "loose";
  income: boolean;
  monthLabel: string;
  line: string;
}) {
```

Depois do `const fmt = ...` (linha ~53), acrescente:

```tsx
  // Célula com várias ocorrências (recorrência semanal) pode estar
  // parcialmente paga: âmbar, com a contagem no canto. Nesse estado o botão
  // só dá baixa nas ABERTAS — repagar as pagas sobrescreveria valor e data
  // do pagamento que já aconteceu.
  const partial = paidCount > 0 && !allPaid;
  const payIds = allPaid ? entries.map((e) => e.id) : entries.filter((e) => !e.paid).map((e) => e.id);
```

Troque o `<button>` do `PopoverTrigger` (linhas 58-66) por:

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
          title={count > 1 ? `${count} ocorrências${partial ? ` · ${paidCount} pagas` : ""}` : undefined}
        >
          {fmt(cents)}
          {partial && count > 1 && (
            <span className="ml-0.5 align-super text-[9px] tabular-nums opacity-70">
              {paidCount}/{count}
            </span>
          )}
        </button>
```

Troque a linha de resumo do popover (linhas 72-76) por:

```tsx
            <p className="text-xs text-muted-foreground">
              {monthLabel} · {formatCents(cents)}
              {count > 1 && ` · ${count} ocorrências`}
              {partial && ` · ${paidCount} ${income ? "recebidas" : "pagas"}`}
              {allPaid && (income ? " · recebido" : " · pago")}
            </p>
```

E troque o formulário de baixa (linhas 102-116) por:

```tsx
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
```

- [ ] **Step 3: Verifique tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/panorama/CellAction.tsx app/\(app\)/panorama/page.tsx
git commit -m "feat: Panorama mostra baixa parcial em âmbar com contagem"
```

---

### Task 6: Revalidação única — o Panorama nunca mais serve dado velho

**Files:**
- Create: `lib/revalidate.ts`
- Modify: `app/(app)/mes/actions.ts` (todas as chamadas de `revalidatePath`)
- Modify: `app/(app)/cartoes/actions.ts`, `app/(app)/itens/actions.ts`, `app/(app)/categorias/actions.ts`, `app/(app)/reservas/actions.ts`, `app/(app)/investimentos/actions.ts`
- Modify: `app/api/telegram/route.ts:116-120` (`revalidateAll`)
- Modify: `app/api/cron/quotes/route.ts:26-27`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `revalidateFinance(): void` exportado de `lib/revalidate.ts`.

- [ ] **Step 1: Leia o guia antes de mexer em cache**

Run: `sed -n '1,60p' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`
Confirme a seção "Revalidating all data": `revalidatePath("/", "layout")` purga o Client Cache e invalida todos os dados cacheados.

- [ ] **Step 2: Crie o helper**

`lib/revalidate.ts`:

```ts
import { revalidatePath } from "next/cache";

/**
 * Uma escrita financeira reflete em várias telas (Mês, Panorama, Dashboard,
 * Cartões, Itens, Investimentos). Listar caminho por caminho em cada action
 * sempre esquece um e deixa tela velha — foi assim que o Panorama parou de
 * refletir o "Pagar" da tela Mês. `revalidatePath("/", "layout")` purga o
 * Client Cache inteiro; como nenhuma página é estática (todas leem do banco a
 * cada request), o único custo é um refetch de RSC na próxima navegação.
 */
export function revalidateFinance(): void {
  revalidatePath("/", "layout");
}
```

- [ ] **Step 3: Troque as chamadas nas Server Actions**

Em cada um dos 6 arquivos de `actions.ts`, troque o import:

```ts
// era:
import { revalidatePath } from "next/cache";
// fica:
import { revalidateFinance } from "@/lib/revalidate";
```

e substitua **todo bloco** de `revalidatePath("/...")` consecutivos por uma única linha `revalidateFinance();`. Por exemplo, em `app/(app)/mes/actions.ts::setEntriesPaid` (linhas 564-566):

```ts
  // era:
  revalidatePath("/panorama");
  revalidatePath("/mes");
  revalidatePath("/dashboard");
  // fica:
  revalidateFinance();
```

Faça o mesmo em `markPaid` (`:74`), `upsertEntry` (`:53`), `applyRange` (`:98`), `copyPreviousMonth` (`:169`), `copyYearAgoMonthAction` (`:231-233`), `createPurchase` (`:281`, `:300-301`, `:322-323`, `:346-347`), `createIncome` (`:377-379`, `:392-393`), `deleteRecurringForward` (`:413-414`), `makeRecurring` (`:424-425`), `deleteEntry` (`:439-440`), `updateInstallment` (`:467-468`), `deleteInstallment` (`:477-478`), `transferValue` (`:521-523`), `updateEntryValue` (`:586-588`) — e em todos os blocos equivalentes dos outros 5 arquivos.

- [ ] **Step 4: Troque no webhook do Telegram e no cron**

Em `app/api/telegram/route.ts`, apague a função `revalidateAll` (linhas 116-120), troque o import de `revalidatePath` por `import { revalidateFinance } from "@/lib/revalidate";` e substitua as chamadas `revalidateAll()` por `revalidateFinance()`.

Em `app/api/cron/quotes/route.ts`, troque o import e substitua as duas linhas (`:26-27`) por `revalidateFinance();`.

- [ ] **Step 5: Verifique que não sobrou nenhum caminho solto**

Run: `grep -rn "revalidatePath" app/ lib/`
Expected: uma única ocorrência de `import` e uma de uso, ambas em `lib/revalidate.ts`.

Run: `grep -rn "revalidateAll" app/`
Expected: nenhuma saída.

- [ ] **Step 6: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; testes passam.

- [ ] **Step 7: Commit**

```bash
git add lib/revalidate.ts app/
git commit -m "fix: toda escrita revalida todas as telas (Panorama parava desatualizado)"
```

---

### Task 7: Fatura zerada não vira linha "0,00" no Panorama

**Files:**
- Modify: `lib/card-entry.ts:19-49` (`upsertCardEntry`), `:186-213` (`updateCardTransaction`), `:215-228` (`deleteCardTransaction`)

**Interfaces:**
- Consumes: `CardRef` com `dueDay` (Task 2).
- Produces: `upsertCardEntry` mantém a assinatura `(opts) => Promise<{ totalCents: number }>`; passa a retornar `{ totalCents: 0 }` tendo apagado o `MonthlyEntry` quando a fatura zerou sem extrato restante.

- [ ] **Step 1: Apague o consolidado quando a fatura zerar**

Em `lib/card-entry.ts::upsertCardEntry`, entre o cálculo de `totalCents` (linhas 42-43) e o `prisma.monthlyEntry.update` (linha 44), insira:

```ts
  // Fatura que zerou e não tem mais nenhuma linha de extrato: o consolidado
  // sobra como uma linha "0,00" no Panorama (foi o que aconteceu com a fatura
  // de jul/26 do Bradesco depois de mover as compras para agosto). Fatura que
  // zera por estorno mantém o consolidado — as transações continuam lá. Fatura
  // já paga é histórico e nunca é apagada.
  if (totalCents === 0 && !existing.paid) {
    const remaining = await prisma.cardTransaction.count({
      where: { cardId: opts.card.id, month: monthDate },
    });
    if (remaining === 0) {
      await prisma.monthlyEntry.delete({ where: { id: existing.id } });
      return { totalCents: 0 };
    }
  }
```

- [ ] **Step 2: Ajuste a ordem em `deleteCardTransaction`**

A checagem do Step 1 só funciona se o extrato já reflita a exclusão. Troque o corpo de `deleteCardTransaction` (linhas 216-228) por:

```ts
  const tx = await prisma.cardTransaction.findUnique({ where: { id: txId }, include: { card: true } });
  if (!tx) return { ok: false, error: "Lançamento não encontrado." };
  const card: CardRef = { id: tx.card.id, name: tx.card.name, closingDay: tx.card.closingDay, dueDay: tx.card.dueDay };
  // Apaga o extrato ANTES de acertar o consolidado: upsertCardEntry olha
  // quantas linhas restaram no mês para decidir se o consolidado zerado sai.
  await prisma.cardTransaction.delete({ where: { id: tx.id } });
  await upsertCardEntry({
    card,
    month: monthStringFromDate(tx.month),
    amountCents: -decimalToCents(String(tx.amount)),
    mode: "add",
  });
  return { ok: true };
```

- [ ] **Step 3: Ajuste a ordem em `updateCardTransaction`**

Mesma razão: quando a linha MUDA de fatura e era a última do mês antigo, o consolidado antigo precisa ver o extrato já atualizado. Troque o trecho das linhas 202-211 por:

```ts
  // Move o extrato ANTES de acertar os consolidados, pelo mesmo motivo de
  // deleteCardTransaction: a decisão de apagar o consolidado zerado do mês
  // antigo depende do extrato já atualizado.
  await prisma.cardTransaction.update({
    where: { id: tx.id },
    data: {
      description: opts.description,
      amount: centsToNumber(opts.amountCents),
      month: monthToDate(opts.monthISO),
    },
  });
  await upsertCardEntry({ card, month: oldMonth, amountCents: -oldCents, mode: "add" });
  await upsertCardEntry({ card, month: opts.monthISO, amountCents: opts.amountCents, mode: "add" });
```

- [ ] **Step 4: Verifique tipos, lint e testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; testes passam (nenhum teste unitário cobre `upsertCardEntry` — ele depende do Prisma; a verificação prática vem na Task 8 e no e2e da Task 9).

- [ ] **Step 5: Commit**

```bash
git add lib/card-entry.ts
git commit -m "fix: consolidado de cartão zerado sem extrato é removido"
```

---

### Task 8: Limpeza das sobras de julho/2026

**Files:**
- Create: `scripts/fix-fatura-jul.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`, `monthToDate` de `@/lib/dates`, `decimalToCents` de `@/lib/money`.
- Produces: script one-off, não importado por ninguém.

- [ ] **Step 1: Escreva o script**

`scripts/fix-fatura-jul.ts`:

```ts
// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";

/**
 * Ajuste único (2026-07-25): duas sobras de dados em jul/2026.
 *
 * (1) Consolidado "Bradesco Amazon" em jul/26 com previsto R$ 0,00 — restou de
 *     quando as compras de 25/07 foram movidas à mão para a fatura de agosto
 *     (o cartão fecha 27/07 e vence 10/08). Aparecia como linha zerada no
 *     Panorama. A regra nova de upsertCardEntry evita que reapareça.
 * (2) Extrato do Nubank em jul/26: duplicatas exatas (descrição + valor) das
 *     linhas de ago/26, sem consolidado correspondente — a tela Cartões de
 *     julho mostrava "Fatura do mês R$ 0,00" com dezenas de linhas embaixo.
 *
 * Idempotente: rodar de novo não faz nada. Se alguma linha de julho NÃO tiver
 * par em agosto, aborta sem apagar nada (sinal de que não é duplicata).
 *
 * Uso: npx tsx scripts/fix-fatura-jul.ts
 */
async function main() {
  const july = monthToDate("2026-07");
  const august = monthToDate("2026-08");

  // (1) Consolidados de cartão zerados e não pagos em julho.
  const cardEntries = await prisma.monthlyEntry.findMany({
    where: { month: july, cardId: { not: null }, paid: false },
    include: { card: true },
  });
  let removedEntries = 0;
  for (const e of cardEntries) {
    if (decimalToCents(String(e.plannedAmount)) !== 0) continue;
    const remaining = await prisma.cardTransaction.count({ where: { cardId: e.cardId!, month: july } });
    if (remaining > 0) {
      console.log(`(1) "${e.card?.name}" está zerado em jul/26 mas tem ${remaining} linha(s) de extrato — preservado.`);
      continue;
    }
    await prisma.monthlyEntry.delete({ where: { id: e.id } });
    removedEntries++;
    console.log(`(1) consolidado zerado removido: "${e.card?.name}" jul/26.`);
  }
  if (removedEntries === 0) console.log("(1) nenhum consolidado zerado para remover em jul/26.");

  // (2) Extrato do Nubank em jul/26 duplicado de ago/26.
  const nubank = await prisma.creditCard.findFirst({
    where: { name: { contains: "nubank", mode: "insensitive" } },
  });
  if (!nubank) {
    console.log("(2) cartão Nubank não encontrado — nada a fazer.");
    return;
  }
  const julyTx = await prisma.cardTransaction.findMany({ where: { cardId: nubank.id, month: july } });
  if (julyTx.length === 0) {
    console.log("(2) nenhuma linha de extrato do Nubank em jul/26 — nada a fazer.");
    return;
  }
  const augustTx = await prisma.cardTransaction.findMany({ where: { cardId: nubank.id, month: august } });
  const key = (t: { description: string; amount: unknown }) => `${t.description}|${String(t.amount)}`;
  const augustKeys = new Set(augustTx.map(key));
  const orphans = julyTx.filter((t) => augustKeys.has(key(t)));
  if (orphans.length !== julyTx.length) {
    throw new Error(
      `(2) ${julyTx.length - orphans.length} de ${julyTx.length} linhas do Nubank em jul/26 não têm par em ago/26 — abortado sem apagar nada.`,
    );
  }
  const { count } = await prisma.cardTransaction.deleteMany({ where: { id: { in: orphans.map((t) => t.id) } } });
  console.log(`(2) ${count} linhas de extrato do Nubank em jul/26 removidas (duplicatas exatas de ago/26).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Rode o script**

Run: `npx tsx scripts/fix-fatura-jul.ts`
Expected:
```
(1) consolidado zerado removido: "Bradesco Amazon" jul/26.
(2) 63 linhas de extrato do Nubank em jul/26 removidas (duplicatas exatas de ago/26).
```

- [ ] **Step 3: Rode de novo e confirme a idempotência**

Run: `npx tsx scripts/fix-fatura-jul.ts`
Expected:
```
(1) nenhum consolidado zerado para remover em jul/26.
(2) nenhuma linha de extrato do Nubank em jul/26 — nada a fazer.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/fix-fatura-jul.ts
git commit -m "chore: limpa sobras de fatura de jul/26 (consolidado zerado + extrato duplicado)"
```

---

### Task 9: Verificação de ponta a ponta

**Files:**
- Nenhum arquivo alterado (só verificação; qualquer correção necessária vira commit próprio).

**Interfaces:**
- Consumes: tudo das Tasks 1-8.
- Produces: evidência de que o app inteiro passa.

- [ ] **Step 1: Suíte completa + tipos + lint + build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde. Não afirme "funcionando" sem esta saída.

- [ ] **Step 2: E2E**

Run: `npm run e2e`
Expected: PASS. O e2e reseta o schema `e2e` e roda as migrations, então a nova coluna é exercitada num banco limpo (onde o `UPDATE` de backfill é no-op).

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
Expected: servidor de produção respondendo em `http://localhost:3123`.

- [ ] **Step 4: Capture os screenshots**

Crie `scripts/_shoot.mjs` (tem que ficar **dentro** do projeto para resolver `@playwright/test`; o chromium já está instalado):

```js
// TEMPORÁRIO — deletar depois de olhar os PNGs. Não commitar.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3123";
const OUT = "/tmp/shots";
const PAGES = [
  ["panorama", "/panorama"],
  ["cartoes-jul", "/cartoes?month=2026-07"],
  ["cartoes-ago", "/cartoes?month=2026-08"],
  ["mes-ago", "/mes?month=2026-08"],
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

- `panorama-*` — a linha "Almoço" em jul/26 em **âmbar** com a contagem (ex.: `5/10`); nenhuma linha "Bradesco Amazon" com `0,00` em jul/26; a legenda do topo mencionando âmbar.
- `cartoes-jul-*` — a fatura do Nubank não lista mais dezenas de linhas de extrato com total R$ 0,00.
- `cartoes-ago-*` — badge de cada cartão mostrando "Fecha 27 · vence 10" e "Fecha 4 · vence 10"; o dialog de edição de cartão traz o campo de vencimento preenchido.
- `mes-ago-*` — a linha do consolidado de cartão mostrando `10` na coluna "Dia" (antes "—").

> Barra de navegação fixa aparecendo no meio de screenshot `fullPage` é artefato conhecido, não bug.

- [ ] **Step 5: Reverta os patches temporários**

Run: `kill %1; git checkout middleware.ts "app/(app)/layout.tsx" && rm -f scripts/_shoot.mjs && git status --short`
Expected: árvore limpa (nenhum patch de bypass, nenhum script de screenshot commitado).

- [ ] **Step 6: Teste manual do caso que originou o ajuste**

Na tela Mês ou Cartões, lance uma compra no **Bradesco Amazon** com data de hoje (25/07/2026), 1x, valor pequeno. Confirme que ela entra na fatura de **ago/26** (não jul/26) — o toast informa a competência e a tela Cartões de agosto mostra o valor somado. Lance uma parcelada em 3x e confirme ago/26, set/26, out/26. Depois exclua as duas pelo extrato ("Ver extrato" em Cartões) e confirme que o consolidado volta ao valor anterior.

- [ ] **Step 7: Commit final (se houve correção) e push**

```bash
git status --short
git log --oneline -9
```

Se alguma correção foi necessária nos steps acima, commite-a antes. Não faça push sem o usuário pedir.

---

## Notas de execução

- **Ordem importa:** Task 1 (regra pura) → Task 2 (campo + propagação) → Task 3 (UI do cartão). Task 4 antes de 5 (a célula consome `paidCount`). Tasks 6 e 7 são independentes. Task 8 depois da 7 (a regra nova evita a reincidência). Task 9 no fim.
- **Migration em produção:** o `.env` aponta para o banco real. A Task 2 aplica DDL nele — é o procedimento do projeto (16 migrations anteriores), mas revise o SQL antes de aplicar.
- **Fora de escopo (não faça):** reroteamento retroativo de compras antigas, vencimento como lançamento próprio, mudança na semântica do pagamento antecipado feito entre o fechamento e o vencimento.
