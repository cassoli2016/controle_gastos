# Export CSV de lançamentos e extrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois botões no Panorama que baixam CSV dos lançamentos e do extrato de cartão, abrindo limpo no Excel pt-BR.

**Architecture:** A serialização é um helper puro testado (`lib/csv-export.ts`); duas rotas (`app/api/export/…`) checam a sessão, montam as linhas e devolvem o arquivo; o Panorama ganha um bloco com dois links de download. Spec: `docs/superpowers/specs/2026-08-02-export-csv-design.md`.

**Tech Stack:** Next.js (Route Handlers), Prisma, NextAuth (`auth()`), Vitest.

## Global Constraints

- **Formato:** separador `;`, vírgula decimal, CRLF entre linhas, BOM UTF-8 no início.
- **Escape RFC 4180:** célula com `;`, `"`, `\n` ou `\r` sai entre aspas, com `"` interno duplicado; `null`/`undefined` viram vazio.
- **Segurança:** `middleware.ts` NÃO cobre `/api` — cada rota chama `auth()` e devolve **401** sem sessão (não redireciona: um redirect baixaria a página de login como se fosse CSV).
- **Nome do arquivo:** `grana-lancamentos-DD-MM-AAAA.csv` e `grana-extrato-DD-MM-AAAA.csv`, com a data de São Paulo (`todayISOInSaoPaulo()`).
- Textos pt-BR com acentuação correta.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Helper `lib/csv-export.ts`

**Files:**
- Create: `lib/csv-export.ts`
- Test: `tests/csv-export.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (Task 2 consome): `type CsvCell = string | number | null | undefined`; `toCsv(headers: string[], rows: CsvCell[][]): string`; `csvMoney(cents: number): string`; `csvDate(d: Date | null): string`.

- [ ] **Step 1: Write the failing test**

Crie `tests/csv-export.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toCsv, csvMoney, csvDate } from "@/lib/csv-export";

const BOM = "﻿";

describe("toCsv", () => {
  it("cabeçalho e linhas com BOM e CRLF", () => {
    expect(toCsv(["A", "B"], [["1", "2"]])).toBe(`${BOM}A;B\r\n1;2\r\n`);
  });

  it("sem linhas devolve só BOM e cabeçalho", () => {
    expect(toCsv(["A", "B"], [])).toBe(`${BOM}A;B\r\n`);
  });

  it("célula com ponto e vírgula sai entre aspas", () => {
    expect(toCsv(["A"], [["x;y"]])).toBe(`${BOM}A\r\n"x;y"\r\n`);
  });

  it("aspas internas são duplicadas", () => {
    expect(toCsv(["A"], [['diz "oi"']])).toBe(`${BOM}A\r\n"diz ""oi"""\r\n`);
  });

  it("quebra de linha na célula sai entre aspas", () => {
    expect(toCsv(["A"], [["linha1\nlinha2"]])).toBe(`${BOM}A\r\n"linha1\nlinha2"\r\n`);
  });

  it("null e undefined viram vazio; número vira texto", () => {
    expect(toCsv(["A", "B", "C"], [[null, undefined, 42]])).toBe(`${BOM}A;B;C\r\n;;42\r\n`);
  });
});

describe("csvMoney", () => {
  it("centavos viram valor com vírgula decimal, sem separador de milhar", () => {
    expect(csvMoney(123456)).toBe("1234,56");
  });
  it("zero e negativo", () => {
    expect(csvMoney(0)).toBe("0,00");
    expect(csvMoney(-5050)).toBe("-50,50");
  });
});

describe("csvDate", () => {
  it("data UTC vira DD/MM/AAAA", () => {
    expect(csvDate(new Date("2026-08-02T00:00:00Z"))).toBe("02/08/2026");
  });
  it("null vira vazio", () => {
    expect(csvDate(null)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/csv-export.test.ts`
Expected: FAIL — `Cannot find module '@/lib/csv-export'`.

- [ ] **Step 3: Write minimal implementation**

Crie `lib/csv-export.ts`:

```ts
/**
 * CSV para abrir no Excel em português: separador ";", vírgula decimal e BOM
 * UTF-8 (sem o BOM o Excel come os acentos). Escape conforme RFC 4180.
 */

export type CsvCell = string | number | null | undefined;

const SEP = ";";
const BOM = "﻿";

/** Envolve em aspas quando a célula tem separador, aspas ou quebra de linha. */
function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (!/[;"\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Monta o CSV inteiro: BOM + cabeçalho + linhas. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const linhas = [headers.map(escapeCell).join(SEP), ...rows.map((r) => r.map(escapeCell).join(SEP))];
  return BOM + linhas.join("\r\n") + "\r\n";
}

/** Centavos → "1234,56" (vírgula decimal, sem milhar nem "R$"). */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Date (UTC) → "02/08/2026"; null → vazio. */
export function csvDate(d: Date | null): string {
  if (!d) return "";
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/csv-export.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/csv-export.ts tests/csv-export.test.ts
git commit -m "feat: serialização CSV para exportação"
```

---

### Task 2: Rotas de export

**Files:**
- Create: `app/api/export/lancamentos/route.ts`
- Create: `app/api/export/extrato/route.ts`

**Interfaces:**
- Consumes: `toCsv`, `csvMoney`, `csvDate`, `type CsvCell` (Task 1); `auth` de `@/lib/auth`; `prisma`; `decimalToCents` de `@/lib/money`; `monthStringFromDate` de `@/lib/dates`; `todayISOInSaoPaulo` de `@/lib/fatura`.
- Produces (Task 3 consome): as URLs `/api/export/lancamentos` e `/api/export/extrato`.

- [ ] **Step 1: Rota de lançamentos**

Crie `app/api/export/lancamentos/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decimalToCents } from "@/lib/money";
import { monthStringFromDate } from "@/lib/dates";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { toCsv, csvMoney, csvDate, type CsvCell } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

/** "2026-08-02" → "02-08-2026" (nome de arquivo legível). */
function fileStamp(): string {
  const iso = todayISOInSaoPaulo();
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/**
 * Baixa todos os lançamentos em CSV (backup do usuário). O middleware não
 * cobre /api, então a sessão é checada aqui — e a resposta é 401, não um
 * redirect, para não baixar a página de login com cara de CSV.
 */
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const rows = await prisma.monthlyEntry.findMany({
    include: {
      item: { include: { category: true } },
      category: true,
      card: { select: { name: true } },
    },
    orderBy: [{ month: "asc" }, { id: "asc" }],
  });

  const linhas: CsvCell[][] = rows.map((r) => {
    const categoria = r.item?.category ?? r.category;
    return [
      monthStringFromDate(r.month),
      r.item?.name ?? r.card?.name ?? r.description ?? "",
      categoria?.name ?? "",
      categoria?.type === "INCOME" ? "Receita" : "Despesa",
      r.card?.name ?? "",
      csvDate(r.purchaseDate),
      csvMoney(decimalToCents(String(r.plannedAmount))),
      r.paid ? "Sim" : "Não",
      r.paidAmount === null ? "" : csvMoney(decimalToCents(String(r.paidAmount))),
      csvDate(r.paidDate),
      r.installmentSeq && r.installmentCount ? `${r.installmentSeq}/${r.installmentCount}` : "",
    ];
  });

  const csv = toCsv(
    [
      "Competência",
      "Descrição",
      "Categoria",
      "Tipo",
      "Cartão",
      "Data",
      "Previsto",
      "Pago",
      "Valor pago",
      "Data do pagamento",
      "Parcela",
    ],
    linhas,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grana-lancamentos-${fileStamp()}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Rota do extrato**

Crie `app/api/export/extrato/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decimalToCents } from "@/lib/money";
import { monthStringFromDate } from "@/lib/dates";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { toCsv, csvMoney, csvDate, type CsvCell } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

/** "2026-08-02" → "02-08-2026" (nome de arquivo legível). */
function fileStamp(): string {
  const iso = todayISOInSaoPaulo();
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Classificação da linha do extrato para leitura na planilha. */
function tipoLinha(t: { prepayment: boolean; subscriptionId: string | null; amountCents: number }): string {
  if (t.prepayment) return "Antecipação";
  if (t.subscriptionId) return "Assinatura";
  return t.amountCents < 0 ? "Estorno" : "Compra";
}

/** Baixa todo o extrato de cartão em CSV (backup do usuário). */
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const rows = await prisma.cardTransaction.findMany({
    include: { card: { select: { name: true } } },
    orderBy: [{ month: "asc" }, { purchaseDate: "asc" }, { id: "asc" }],
  });

  const linhas: CsvCell[][] = rows.map((t) => {
    const amountCents = decimalToCents(String(t.amount));
    return [
      t.card.name,
      monthStringFromDate(t.month),
      csvDate(t.purchaseDate),
      t.description,
      csvMoney(amountCents),
      t.installmentSeq && t.installmentCount ? `${t.installmentSeq}/${t.installmentCount}` : "",
      tipoLinha({ prepayment: t.prepayment, subscriptionId: t.subscriptionId, amountCents }),
    ];
  });

  const csv = toCsv(
    ["Cartão", "Fatura", "Data da compra", "Descrição", "Valor", "Parcela", "Tipo"],
    linhas,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grana-extrato-${fileStamp()}.csv"`,
    },
  });
}
```

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes em outros arquivos).

- [ ] **Step 4: Provar o guard de sessão**

Com `npm run dev` num terminal, **sem estar logado** (use `curl`, que não manda cookie):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/export/lancamentos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/export/extrato
```

Expected: `401` nas duas. Se vier `200`, o guard não está funcionando — pare e investigue antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add app/api/export/lancamentos/route.ts app/api/export/extrato/route.ts
git commit -m "feat: rotas de exportação em CSV"
```

---

### Task 3: Bloco "Exportar" no Panorama

**Files:**
- Modify: `app/(app)/panorama/page.tsx`

**Interfaces:**
- Consumes: as URLs da Task 2; `Button` (já importado no arquivo).
- Produces: UI final.

- [ ] **Step 1: Ícone**

No import de `lucide-react` do arquivo (hoje `import { Eye, EyeOff } from "lucide-react";`), acrescente `Download`.

- [ ] **Step 2: Bloco no rodapé do card**

Dentro do `<CardContent className="px-0">`, **depois** do `<div className="overflow-x-auto">…</div>` que envolve a tabela (ou seja, como último filho do CardContent, fora do scroll horizontal):

```tsx
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Exportar — uma cópia dos seus dados em CSV (abre no Excel).
              </span>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/export/lancamentos" download>
                    <Download />
                    Lançamentos
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href="/api/export/extrato" download>
                    <Download />
                    Extrato de cartão
                  </a>
                </Button>
              </div>
            </div>
```

O bloco fica fora do ramo do estado vazio ("Nenhum lançamento ainda.") — quando não há lançamento nenhum, não há o que exportar.

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: tudo verde; build lista `/api/export/lancamentos` e `/api/export/extrato`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/panorama/page.tsx"
git commit -m "feat: bloco de exportação no Panorama"
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

- [ ] **Step 3: baixar os dois arquivos logado, com dados reais**

Suba o app compilado com senha de teste e baixe pelos endpoints usando o cookie de sessão:

```bash
APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3191
```

Com Playwright: login em `/login`, ir a `/panorama`, clicar em cada botão capturando o download (`page.waitForEvent("download")`), salvar os dois arquivos no scratchpad e imprimir: nome sugerido, número de linhas, o cabeçalho e as 3 primeiras linhas de cada.

**Confira**: o número de linhas de lançamentos bate com a contagem da tabela (`SELECT COUNT(*) FROM "MonthlyEntry"`); o cabeçalho tem as 11 colunas na ordem do spec; valores aparecem como `1234,56`; uma descrição com acento sai legível.

- [ ] **Step 4: encerrar o servidor e anexar as amostras ao relatório**
