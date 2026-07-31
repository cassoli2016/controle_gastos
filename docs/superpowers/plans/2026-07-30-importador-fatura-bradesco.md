# Importador de Fatura Bradesco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar a fatura PDF do Bradesco pela tela Cartões: preview validado com descrições editáveis → replace do mês-alvo + reconstrução dos meses futuros.

**Architecture:** Parser e cronograma 100% puros em `lib/bradesco-fatura.ts` (TDD com fixture do texto real anonimizado); aplicação com prisma em `lib/bradesco-import.ts` (generaliza os scripts `fix-fatura-ago-bradesco.ts`/`fix-faturas-futuras-bradesco.ts`); duas server actions blindadas; dialog client na tela Cartões. Extração de texto com `unpdf`.

**Tech Stack:** Next.js App Router, `unpdf`, Prisma 7, zod, vitest, Playwright (verificação com o PDF real).

**Spec:** `docs/superpowers/specs/2026-07-30-importador-fatura-bradesco-design.md`

## Global Constraints

- Dinheiro em centavos inteiros; textos pt-BR acentuados; commits convencionais pt-BR com rodapé padrão da sessão.
- Branch: `feat/importador-fatura-bradesco` (criada, contém o spec).
- O PDF real NUNCA entra no repo (contém PII) — a fixture de teste é o TEXTO extraído com nome/CPF/endereço anonimizados.
- Convenções da fatura: ver `docs/fatura-bradesco-pdf.md` (linha `dd/mm DESC valor[ -]`, negativo com espaço antes do `-` no texto extraído, "pagamento recebido" é a única linha fora da importação).

---

### Task 1: Dependência `unpdf` + bodySizeLimit

**Files:**
- Modify: `package.json` (via npm), `next.config.ts`

**Interfaces:**
- Produces: `unpdf` disponível (`extractText`, `getDocumentProxy`); actions aceitam corpo até 4MB.

- [ ] **Step 1:** `npm install unpdf`
- [ ] **Step 2:** `next.config.ts` (chave confirmada na doc do Next instalado — `01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`):

```ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload do PDF da fatura (o padrão de 1MB é apertado p/ faturas longas).
      bodySizeLimit: "4mb",
    },
  },
};
```

- [ ] **Step 3:** `npm run build` → compila.
- [ ] **Step 4:** Commit `feat: unpdf e limite de corpo para upload de fatura`.

---

### Task 2: Fixture anonimizada + `lib/bradesco-fatura.ts` (parser, cronograma, validações)

**Files:**
- Create: `lib/bradesco-fatura.ts`, `tests/fixtures/bradesco-fatura.txt`
- Test: `tests/bradesco-fatura.test.ts`

**Interfaces:**
- Consumes: `parseBRLToCents` (`lib/money`), `normalizeDescription` (`lib/description-match`), `monthToDate`/`monthStringFromDate` (`lib/dates`).
- Produces:

```ts
export type FaturaLineKind = "purchase" | "refund" | "payment";
export type FaturaLine = {
  dateISO: string;
  description: string;
  cents: number; // negativo em refund/payment
  kind: FaturaLineKind;
  installment: { seq: number; count: number } | null;
};
export type BradescoFatura = {
  faturaMonth: string;   // mês do vencimento (YYYY-MM)
  dueDateISO: string;
  closingISO: string;    // fechamento corrente (previsão do próximo − 1 mês)
  totalCents: number;    // "Total da fatura" (página 1)
  summary: { saldoAnteriorCents: number; creditosCents: number; comprasCents: number; totalCents: number };
  upcoming: { nextCents: number; remainingCents: number; totalCents: number } | null;
  lines: FaturaLine[];
  warnings: string[];
};
export function parseBradescoFatura(text: string): BradescoFatura | { error: string };
export function sumFaturaLines(lines: FaturaLine[]): number; // líquida, sem payment
export function buildInstallmentSchedule(
  lines: FaturaLine[],
  faturaMonth: string,
): Map<string, { dateISO: string; description: string; cents: number }[]>;
export function scheduleWarnings(fatura: BradescoFatura): string[]; // vs upcoming, tolerância 500
```

- [ ] **Step 1: Gerar a fixture** — extrair o texto do PDF real (script one-off no scratchpad com unpdf, mergePages true) e salvar em `tests/fixtures/bradesco-fatura.txt` substituindo: nome do titular → `FULANO DE TAL`, CPF → `000.000.000-00`, endereço/CEP → `RUA EXEMPLO 1, BAIRRO, CIDADE, 00000-000`, "Nosso Número"/códigos de boleto → zeros. Valores, datas e linhas de lançamento ficam INTACTOS. Conferir com grep que não sobrou o nome nem o CPF reais.

- [ ] **Step 2: Testes que falham** (`tests/bradesco-fatura.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseBradescoFatura, sumFaturaLines, buildInstallmentSchedule, scheduleWarnings,
  type BradescoFatura,
} from "@/lib/bradesco-fatura";

const TEXT = readFileSync("tests/fixtures/bradesco-fatura.txt", "utf8");
const fatura = parseBradescoFatura(TEXT) as BradescoFatura;

describe("parseBradescoFatura — metadados", () => {
  it("não retorna erro", () => expect("error" in fatura).toBe(false));
  it("vencimento e competência", () => {
    expect(fatura.dueDateISO).toBe("2026-08-10");
    expect(fatura.faturaMonth).toBe("2026-08");
  });
  it("fechamento corrente = previsão do próximo − 1 mês", () =>
    expect(fatura.closingISO).toBe("2026-07-27"));
  it("total e resumo", () => {
    expect(fatura.totalCents).toBe(112832);
    expect(fatura.summary).toEqual({
      saldoAnteriorCents: 103153,
      creditosCents: 139546,
      comprasCents: 149225,
      totalCents: 112832,
    });
  });
  it("total parcelado futuro", () =>
    expect(fatura.upcoming).toEqual({ nextCents: 143198, remainingCents: 762877, totalCents: 906075 }));
});

describe("parseBradescoFatura — linhas", () => {
  it("46 linhas de lançamento + 1 pagamento", () => {
    expect(fatura.lines).toHaveLength(47);
    expect(fatura.lines.filter((l) => l.kind === "payment")).toHaveLength(1);
    expect(fatura.lines.filter((l) => l.kind === "refund")).toHaveLength(1);
  });
  it("ano inferido: novembro é do ano anterior", () => {
    const nov = fatura.lines[0];
    expect(nov.dateISO).toBe("2025-11-21");
    expect(nov.installment).toEqual({ seq: 9, count: 12 });
    expect(nov.cents).toBe(1594);
  });
  it("negativo com espaço antes do hífen (estorno)", () => {
    const refund = fatura.lines.find((l) => l.kind === "refund")!;
    expect(refund.cents).toBe(-36393);
    expect(refund.dateISO).toBe("2026-07-13");
  });
  it("pagamento é negativo e identificado sem caixa/acentos", () => {
    const pay = fatura.lines.find((l) => l.kind === "payment")!;
    expect(pay.cents).toBe(-103153);
  });
  it("soma líquida sem o pagamento = total da fatura", () =>
    expect(sumFaturaLines(fatura.lines)).toBe(112832));
});

describe("buildInstallmentSchedule", () => {
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth);
  it("próxima fatura soma R$ 1.432,33 (rounding do banco → aviso, não erro)", () => {
    const set = schedule.get("2026-09") ?? [];
    expect(set.reduce((a, r) => a + r.cents, 0)).toBe(143233);
  });
  it("marcador incrementado", () => {
    const set = schedule.get("2026-09") ?? [];
    expect(set.some((r) => r.description.includes("(10/12)"))).toBe(true);
  });
  it("estorno não gera parcelas futuras", () => {
    const all = [...schedule.values()].flat();
    expect(all.every((r) => r.cents > 0)).toBe(true);
  });
  it("total futuro R$ 9.063,70", () => {
    const all = [...schedule.values()].flat();
    expect(all.reduce((a, r) => a + r.cents, 0)).toBe(906370);
  });
});

describe("validações", () => {
  it("scheduleWarnings aponta a divergência de centavos", () =>
    expect(scheduleWarnings(fatura).length).toBeGreaterThan(0));
  it("texto sem âncoras → erro amigável", () => {
    expect(parseBradescoFatura("nada a ver")).toHaveProperty("error");
  });
});
```

- [ ] **Step 3:** Rodar → FAIL (módulo não existe).

- [ ] **Step 4: Implementar `lib/bradesco-fatura.ts`.** Regexes-âncora:

```ts
const DUE_RE = /Vencimento\s+(\d{2}\/\d{2}\/\d{4})/;
const NEXT_CLOSING_RE = /previsão de fechamento[^\d]*(\d{2}\/\d{2}\/\d{4})/i;
const TOTAL_RE = /Total da fatura\s*R\$\s*([\d.,]+)/;
const SALDO_RE = /Saldo anterior\s+R\$\s*([\d.,]+)/;
const CREDITOS_RE = /Créditos\/Pagamentos\s+R\$\s*([\d.,]+)\s*-/;
const COMPRAS_RE = /Compras\/Débitos\s+R\$\s*([\d.,]+)/;
const RESUMO_TOTAL_RE = /\(=\) Total\s+R\$\s*([\d.,]+)/;
const NEXT_RE = /Próxima fatura\s+R\$\s*([\d.,]+)/;
const REMAINING_RE = /Demais faturas\s+R\$\s*([\d.,]+)/;
const UPCOMING_TOTAL_RE = /Total para as próximas faturas\s+R\$\s*([\d.,]+)/;
const LINE_RE = /^(\d{2})\/(\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?\s*$/;
const MARKER_RE = /\((\d{2})\/(\d{2})\)/;
```

Regras: sem `DUE_RE`/`TOTAL_RE`/`RESUMO_TOTAL_RE` → `{ error: "Não parece uma fatura Bradesco (PDF sem as âncoras esperadas)." }`; linhas varridas com `LINE_RE` sobre `text.split("\n")` (o formato exige valor monetário com vírgula — nada mais no documento casa); ano: mês da linha > mês de `closingISO` → ano anterior; `kind`: `normalizeDescription(desc).includes("pagamento recebido")` → payment, senão negativo → refund, senão purchase; `cents` negativo quando sufixo `-`; `closingISO` = data do NEXT_CLOSING − 1 mês (UTC, mantém o dia; fallback sem âncora: dia 28 do mês anterior ao vencimento); soma líquida ≠ `(=) Total` → `{ error }` com os dois valores formatados; `totalCents` (pág. 1) ≠ resumo → warning. `buildInstallmentSchedule`: para cada purchase com `installment` e `seq < count`, parcelas `seq+1..count` em `faturaMonth + (k − seq)` meses, descrição com marcador substituído (`String(k).padStart(2, "0")`). `scheduleWarnings`: compara próxima/total do cronograma com `upcoming` (tolerância 500; sem `upcoming` → sem aviso).

- [ ] **Step 5:** Rodar → PASS. `npm test` inteiro → verde.
- [ ] **Step 6:** Commit `feat: parser e cronograma da fatura Bradesco`.

---

### Task 3: `lib/bradesco-import.ts` (aplicação com prisma)

**Files:**
- Create: `lib/bradesco-import.ts`

**Interfaces:**
- Consumes: `replaceCardMonth`, `upsertCardEntry`, `CardRef`, `CardMonthRow` (`lib/card-entry`); `buildInstallmentSchedule`, `FaturaLine` (Task 2).
- Produces: `applyBradescoFaturaImport(opts: { card: CardRef; faturaMonth: string; closingISO: string; lines: FaturaLine[] }): Promise<{ months: { month: string; totalCents: number }[] }>`.

- [ ] **Step 1: Implementar** (mesma semântica dos scripts já validados em produção; sem teste unitário — a verificação é a reimportação idempotente da fatura real na Task 6):

```ts
import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { decimalToCents, centsToNumber } from "@/lib/money";
import { replaceCardMonth, upsertCardEntry, type CardRef, type CardMonthRow } from "@/lib/card-entry";
import { buildInstallmentSchedule, type FaturaLine } from "@/lib/bradesco-fatura";

/**
 * Aplica a fatura importada: replace do mês-alvo + reconstrução dos meses
 * seguintes pelo cronograma de parcelas. Preserva antecipações (prepayment)
 * e compras com data APÓS o fechamento (ciclo novo). Idempotente.
 */
export async function applyBradescoFaturaImport(opts: {
  card: CardRef;
  faturaMonth: string;
  closingISO: string;
  lines: FaturaLine[];
}): Promise<{ months: { month: string; totalCents: number }[] }> {
  const { card, faturaMonth, closingISO, lines } = opts;
  const rows: CardMonthRow[] = lines
    .filter((l) => l.kind !== "payment")
    .map((l) => ({ description: l.description, amountCents: l.cents, dateISO: l.dateISO }));
  const target = await replaceCardMonth(card, faturaMonth, rows);
  const months = [{ month: faturaMonth, totalCents: target.totalCents }];

  const schedule = buildInstallmentSchedule(lines, faturaMonth);
  // Reconstruir: meses do cronograma ∪ meses futuros que já têm extrato
  // (projeções antigas que o cronograma novo não cobre precisam ser zeradas).
  const existing = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(faturaMonth) } },
    select: { month: true },
    distinct: ["month"],
  });
  const monthsToRebuild = [
    ...new Set([...schedule.keys(), ...existing.map((e) => monthStringFromDate(e.month))]),
  ].sort();
  const cutoff = new Date(closingISO + "T23:59:59Z");

  for (const month of monthsToRebuild) {
    const monthDate = monthToDate(month);
    await prisma.cardTransaction.deleteMany({
      where: {
        cardId: card.id,
        month: monthDate,
        prepayment: false,
        OR: [{ purchaseDate: null }, { purchaseDate: { lte: cutoff } }],
      },
    });
    const derived = schedule.get(month) ?? [];
    if (derived.length > 0) {
      await prisma.cardTransaction.createMany({
        data: derived.map((r) => ({
          cardId: card.id,
          month: monthDate,
          description: r.description,
          amount: centsToNumber(r.cents),
          purchaseDate: new Date(r.dateISO + "T00:00:00Z"),
        })),
      });
    }
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthDate },
      _sum: { amount: true },
    });
    const totalCents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
    months.push({ month, totalCents });
  }
  return { months };
}
```

- [ ] **Step 2:** `npx tsc --noEmit` limpo. Commit `feat: aplicação da fatura importada com reconstrução dos meses`.

---

### Task 4: Server actions `previewBradescoFatura` + `applyBradescoFatura`

**Files:**
- Modify: `app/(app)/cartoes/actions.ts`

**Interfaces:**
- Consumes: Task 2 e 3; `guardAction`; padrão de ActionState local do arquivo (conferir shape existente).
- Produces (consumidas pelo dialog da Task 5):
  - `previewBradescoFatura(prev, formData)` → `{ error?: string; preview?: FaturaPreview }` onde `FaturaPreview = { cardId: string; faturaMonth: string; dueDateISO: string; closingISO: string; totalCents: number; warnings: string[]; lines: FaturaLine[] }`.
  - `applyBradescoFatura(prev, formData)` → `{ error?: string; ok?: boolean; summary?: { month: string; totalCents: number }[] }`; formData tem `payload` (JSON validado com zod: cardId cuid, faturaMonth regex `^\d{4}-\d{2}$`, closingISO date, totalCents int, lines array com shape de FaturaLine; máx 500 linhas; descrição 1..120 chars) e RE-VALIDA `sumFaturaLines(lines) === totalCents` (erro se divergir).

- [ ] **Step 1:** Implementar as duas actions (com `guardAction`, como todas do arquivo). Preview: `formData.get("file")` como `File`; guards: existe, `size <= 4 * 1024 * 1024`, nome/tipo pdf; `const text = (await extractText(await getDocumentProxy(new Uint8Array(await file.arrayBuffer())), { mergePages: true })).text;` → `parseBradescoFatura` → erro do parser vira `{ error }`; senão monta preview com `warnings: [...fatura.warnings, ...scheduleWarnings(fatura)]`. Apply: parse zod → busca o cartão (`prisma.creditCard.findUnique`) → `applyBradescoFaturaImport` → `revalidateFinance()` → `{ ok: true, summary: months }`.
- [ ] **Step 2:** `npm test && npx tsc --noEmit && npm run lint` → verde. Commit `feat: actions de preview e aplicação da fatura Bradesco`.

---

### Task 5: `ImportFaturaDialog` + botão na tela Cartões

**Files:**
- Create: `app/(app)/cartoes/ImportFaturaDialog.tsx`
- Modify: `app/(app)/cartoes/CardRow.tsx` (ou onde ficam "Ver extrato/Antecipar/Assinaturas" — conferir; adicionar o botão "Importar fatura")

**Interfaces:**
- Consumes: actions da Task 4, `useActionToast`, componentes ui (Dialog, Button, Input, Badge), `formatCents`, `formatCompetencia`/`monthToDate`.

- [ ] **Step 1:** Dialog client seguindo o padrão dos dialogs do diretório (ex.: `PrepaymentDialog`): estado `preview | null`; **passo upload**: form com `<input type="file" name="file" accept="application/pdf" />` + hidden `cardId` + submit "Ler fatura" via `useActionState(previewBradescoFatura)`; quando `state.preview` chega, copia para estado local editável. **Passo preview**: cabeçalho (competência `formatCompetencia`, total `formatCents`, contagem de linhas), avisos em texto âmbar, tabela rolável (`max-h-96 overflow-y-auto`) com Data · Input de descrição (`value`/`onChange` no estado local; linha payment desabilitada e riscada) · valor `tabular-nums` (negativo em verde, padrão do extrato); rodapé com form 2 `useActionState(applyBradescoFatura)` + `<input type="hidden" name="payload" value={JSON.stringify({...})} />` e botão "Importar fatura"; sucesso → toast com resumo (`summary.length` meses atualizados) e fecha (padrão "adjust state while rendering" usado no PayCell).
- [ ] **Step 2:** Botão no card do cartão ao lado de "Antecipar" (mesmo tamanho/variant dos vizinhos), ícone `FileUp` (lucide).
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npm run lint` → verde. Commit `feat: dialog de importação de fatura na tela Cartões`.

---

### Task 6: Verificação de ponta a ponta com o PDF real + suíte + PR

**Files:**
- Patch temporário (NUNCA commitar): `middleware.ts`, `app/(app)/layout.tsx`
- Create temporário (deletar depois): `scripts/_e2e-import.mjs`

- [ ] **Step 1:** Bypass de auth (padrão), `npm run build`, `npx next start -p 3123`.
- [ ] **Step 2:** Playwright: abrir `/cartoes?month=2026-08`, clicar "Importar fatura" do Bradesco, `setInputFiles` com o PDF real (path de uploads), "Ler fatura", screenshot do PREVIEW (conferir: competência ago/2026, total R$ 1.128,32, 47 linhas, aviso de centavos), editar uma descrição, confirmar "Importar fatura", screenshot do resultado.
- [ ] **Step 3:** Conferir no banco (diagnóstico do scratchpad): reimportação é idempotente — ago/2026 = R$ 1.128,32, set/2026 = R$ 1.503,66 (cronograma + AMAZON BR 71,33 preservada), jun/2027 = R$ 71,33; a linha editada aparece com o apelido.
- [ ] **Step 4:** Reverter patches, deletar temporários, `git status` limpo.
- [ ] **Step 5:** `npm test && npm run lint && npm run build` → verde.
- [ ] **Step 6:** Push + `gh pr create` (resumo + como foi testado + rodapé padrão).
