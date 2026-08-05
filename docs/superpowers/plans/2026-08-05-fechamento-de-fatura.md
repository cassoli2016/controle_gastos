# Fechamento de fatura como estado dos planos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fatura importada deixa de ser "o total do mês" e passa a ser o estado de cada plano de parcelamento: o que o app lançou e o banco não cobrou caminha para frente, e a cauda de cada plano é acertada para o que a fatura implica.

**Architecture:** Quatro funções puras encadeadas — ler a parcela de uma linha do app (duas convenções), canonizar descrição para casar com a fatura, derivar o estado de cada plano, e reconciliar a cauda dos meses futuros. Só a última etapa toca o banco, dentro de `applyFaturaImport`.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7 (Postgres), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-fechamento-de-fatura-design.md`
**Empilha sobre:** PR #29, branch `feat/fatura-pdf-telegram`

## Global Constraints

- **Dinheiro sempre em centavos inteiros.** `parseBRLToCents`, `formatCents`, `decimalToCents`, `centsToNumber` de `@/lib/money`. Nunca float.
- **Imports por alias `@/`.** Nunca caminho relativo entre pastas de topo.
- **Comentários em português**, explicando o *porquê* (a regra ou a armadilha). Referência de estilo: `lib/fatura-core.ts`, `lib/fatura.ts`.
- **Versão + changelog no mesmo commit** (`AGENTS.md`): alvo **1.4.0** (minor). `tests/changelog.test.ts` trava o sincronismo.
- **Nada de PDF/CSV de fatura no repo.** A fixture `tests/fixtures/nubank-fatura.txt` é anonimizada e já existe.
- **Fail-closed:** a importação não grava se a fatura não fechar (já vale, vem do PR #29).
- Baseline desta branch: **428 testes**, `npx tsc --noEmit` limpo, `npm run lint` com 4 warnings pré-existentes em `app/(app)/dashboard/page.tsx` e `app/(app)/investimentos/actions.ts` — não são regressão.
- **Nunca rodar script que grava contra o banco de produção sem `--apply` explícito e sem mostrar a simulação antes.** O `DATABASE_URL` do `.env` aponta para produção.

## A simplificação que dispensa um módulo

O deslocamento de plano **não tem lógica própria**. Se a parcela 3/6 está no app em
agosto e não vem na fatura, o estado daquele plano é "cobrado até 2", e a cauda
esperada vira 3..6 começando em setembro — que é o deslocamento. Um único mecanismo
cobre os três casos:

| Situação | `chargedThrough` | Cauda |
|---|---|---|
| Normal: fatura mostra 8/12 | 8 | 9..12 |
| Quitação antecipada: fatura mostra 10/10 | 10 | vazia |
| Parcela atrasada: app tinha 3/6, fatura não traz | 2 | 3..6 (deslocou) |

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/fatura-aliases.ts` *(criar)* | Tabela de apelidos de estabelecimento + `canonicalFaturaDescription`. Único lugar a editar quando aparecer apelido novo. |
| `lib/fatura-match.ts` *(criar)* | `readInstallment`, `matchKey`, `findOrphans`. Casamento app × fatura. Puro. |
| `lib/fatura-plan.ts` *(criar)* | `faturaPlanStates`, `expectedTail`, `reconcileTail`. O coração. Puro. |
| `lib/fatura-core.ts` *(modificar)* | Exportar `planKey` (hoje privada) para os módulos acima usarem a mesma chave. |
| `lib/fatura-import.ts` *(modificar)* | Trocar a reconstrução por reconciliação; aplicar as órfãs. |
| `app/(app)/cartoes/actions.ts` *(modificar)* | Data de pagamento no payload; baixa; detalhe do preview. |
| `app/(app)/cartoes/ImportFaturaDialog.tsx` *(modificar)* | Campo de data e o detalhe por mês. |

---

### Task 1: Ler a parcela nas duas convenções + canonizar descrição

Sem isto nada casa. O app grava parcela de dois jeitos: `addPurchaseToCard` põe
`installmentSeq/Count` nas colunas e descrição **sem** marcador; importação de
CSV/fatura põe marcador na descrição e deixa as colunas nulas.

**Files:**
- Create: `lib/fatura-aliases.ts`
- Create: `lib/fatura-match.ts`
- Create: `tests/fatura-match.test.ts`

**Interfaces:**
- Consumes: `normalizeDescription` de `@/lib/description-match`.
- Produces:
  - `canonicalFaturaDescription(description: string): string`
  - `readInstallment(row: { description: string; installmentSeq?: number | null; installmentCount?: number | null }): { seq: number; count: number } | null`
  - `matchKey(description: string, cents: number): string`

- [ ] **Step 1: Escrever o teste que falha**

`tests/fatura-match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canonicalFaturaDescription, readInstallment, matchKey } from "@/lib/fatura-match";

describe("canonicalFaturaDescription", () => {
  it("tira o prefixo Antecipada", () => {
    // Medido na fatura real: 26 das 31 falsas órfãs eram só este prefixo.
    expect(canonicalFaturaDescription("Antecipada - Nescafe Dolce Gusto - Parcela 3/10")).toBe(
      canonicalFaturaDescription("Nescafe Dolce Gusto - Parcela 3/10"),
    );
  });

  it("resolve o apelido do NuTag", () => {
    // App grava "NuTag*BEI2A53", fatura grava "Transação de NuTag".
    expect(canonicalFaturaDescription("NuTag*BEI2A53")).toBe(canonicalFaturaDescription("Transação de NuTag"));
  });

  it("ignora caixa e acento", () => {
    expect(canonicalFaturaDescription("ASSOCIACAO FRANCISCANA")).toBe(canonicalFaturaDescription("Associação Franciscana"));
  });

  it("não junta estabelecimentos diferentes", () => {
    expect(canonicalFaturaDescription("Mabu Hotel")).not.toBe(canonicalFaturaDescription("Hotel Brasil"));
  });
});

describe("readInstallment", () => {
  it("lê das colunas (convenção do bot/share)", () => {
    expect(readInstallment({ description: "Beto Carrero World", installmentSeq: 3, installmentCount: 10 })).toEqual({
      seq: 3,
      count: 10,
    });
  });

  it("lê do marcador Nubank na descrição", () => {
    expect(readInstallment({ description: "Mabu Hotel - Parcela 3/6" })).toEqual({ seq: 3, count: 6 });
  });

  it("lê do marcador Bradesco na descrição", () => {
    expect(readInstallment({ description: "AMAZON BR SAO PAULO(09/12)" })).toEqual({ seq: 9, count: 12 });
  });

  it("coluna ganha do marcador quando os dois existem", () => {
    expect(
      readInstallment({ description: "Loja - Parcela 2/4", installmentSeq: 3, installmentCount: 4 }),
    ).toEqual({ seq: 3, count: 4 });
  });

  it("compra à vista não tem parcela", () => {
    expect(readInstallment({ description: "Festval Torres" })).toBeNull();
    expect(readInstallment({ description: "Mp *20526951adria" })).toBeNull();
    expect(readInstallment({ description: "230 Liv Ctba" })).toBeNull();
  });
});

describe("matchKey", () => {
  it("mesma chave para as duas grafias do mesmo lançamento", () => {
    expect(matchKey("Antecipada - Associacao Franciscana - Parcela 7/9", 3088)).toBe(
      matchKey("Associação Franciscana - Parcela 7/9", 3088),
    );
  });

  it("valor diferente é chave diferente", () => {
    expect(matchKey("Festval Torres", 1000)).not.toBe(matchKey("Festval Torres", 1001));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/fatura-match.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/fatura-match"`.

- [ ] **Step 3: Criar `lib/fatura-aliases.ts`**

```ts
/**
 * Estabelecimentos que o app e a fatura chamam por nomes diferentes.
 *
 * Medido na fatura de ago/2026: das 31 divergências entre app e fatura, 26 eram
 * só o prefixo "Antecipada - " e 5 eram o NuTag. Este é o único lugar a editar
 * quando aparecer um apelido novo — sem isso a linha vira órfã falsa e é movida
 * para o mês seguinte sem precisar.
 *
 * Chave e valor entram já em minúsculas e sem acento (`normalizeDescription`).
 */
export const FATURA_ALIASES: { pattern: RegExp; canonical: string }[] = [
  // Cada NuTag tem um sufixo próprio ("NuTag*BEI2A53"); a fatura chama todos de
  // "Transação de NuTag".
  { pattern: /^nutag\*?.*$/, canonical: "transacao de nutag" },
];
```

- [ ] **Step 4: Criar `lib/fatura-match.ts`**

```ts
/**
 * Casamento entre o que o app tem no mês e o que a fatura cobrou.
 *
 * Duas dificuldades resolvidas aqui:
 *   1. O app grava parcela de dois jeitos — `installmentSeq/Count` nas colunas
 *      (bot/share, descrição sem marcador) ou marcador na descrição (importação
 *      de CSV/fatura, colunas nulas).
 *   2. As descrições divergem: a fatura prefixa "Antecipada - " na quitação
 *      antecipada e usa outro nome para o NuTag.
 */
import { normalizeDescription } from "@/lib/description-match";
import { FATURA_ALIASES } from "@/lib/fatura-aliases";

const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;
const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)$/;
const ANTECIPADA_PREFIX_RE = /^antecipada - /;

/** Descrição comparável entre app e fatura. */
export function canonicalFaturaDescription(description: string): string {
  let d = normalizeDescription(description).replace(ANTECIPADA_PREFIX_RE, "");
  for (const { pattern, canonical } of FATURA_ALIASES) {
    if (pattern.test(d)) return canonical;
  }
  return d;
}

/**
 * Parcela de uma linha, nas duas convenções. As COLUNAS ganham: quando existem,
 * são o dado explícito; o marcador é inferência sobre texto.
 */
export function readInstallment(row: {
  description: string;
  installmentSeq?: number | null;
  installmentCount?: number | null;
}): { seq: number; count: number } | null {
  if (row.installmentSeq != null && row.installmentCount != null) {
    return { seq: row.installmentSeq, count: row.installmentCount };
  }
  const nubank = NUBANK_MARKER_RE.exec(row.description);
  if (nubank) return { seq: Number(nubank[1]), count: Number(nubank[2]) };
  const bradesco = BRADESCO_MARKER_RE.exec(row.description);
  if (bradesco) return { seq: Number(bradesco[1]), count: Number(bradesco[2]) };
  return null;
}

/** Chave de casamento: descrição comparável + valor exato. */
export function matchKey(description: string, cents: number): string {
  return `${canonicalFaturaDescription(description)}|${cents}`;
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/fatura-match.test.ts`
Expected: PASS (12 testes).

- [ ] **Step 6: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 428 + 12 testes, tsc sem saída, lint com os 4 warnings de sempre.

- [ ] **Step 7: Commit**

```bash
git add lib/fatura-aliases.ts lib/fatura-match.ts tests/fatura-match.test.ts
git commit -m "feat: casamento de linhas entre app e fatura"
```

---

### Task 2: Órfãs — o que o app lançou e o banco não cobrou

**Files:**
- Modify: `lib/fatura-match.ts`
- Modify: `tests/fatura-match.test.ts`

**Interfaces:**
- Consumes: `matchKey` (Task 1); `FaturaLine` de `@/lib/fatura-core`.
- Produces:
  - `type AppRow = { id: string; description: string; cents: number; installment: { seq: number; count: number } | null }`
  - `findOrphans(appRows: AppRow[], faturaLines: FaturaLine[]): AppRow[]`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `tests/fatura-match.test.ts`:

```ts
import { findOrphans, type AppRow } from "@/lib/fatura-match";
import type { FaturaLine } from "@/lib/fatura-core";

function app(id: string, description: string, cents: number, seq?: number, count?: number): AppRow {
  return { id, description, cents, installment: seq && count ? { seq, count } : null };
}
function inv(description: string, cents: number, seq?: number, count?: number): FaturaLine {
  return {
    dateISO: "2026-07-05",
    description,
    cents,
    kind: cents < 0 ? "refund" : "purchase",
    installment: seq && count ? { seq, count } : null,
  };
}

describe("findOrphans", () => {
  it("linha com par na fatura não é órfã", () => {
    expect(findOrphans([app("1", "Festval Torres", 23908)], [inv("Festval Torres", 23908)])).toEqual([]);
  });

  it("linha sem par é órfã", () => {
    const orphans = findOrphans([app("1", "Es Estacionamento", 23000)], [inv("Festval Torres", 23908)]);
    expect(orphans.map((o) => o.id)).toEqual(["1"]);
  });

  it("casa apesar do prefixo Antecipada", () => {
    const rows = [app("1", "Nescafe Dolce Gusto - Parcela 3/10", 3380, 3, 10)];
    const lines = [inv("Antecipada - Nescafe Dolce Gusto - Parcela 3/10", 3380, 3, 10)];
    expect(findOrphans(rows, lines)).toEqual([]);
  });

  it("casa apesar do apelido do NuTag", () => {
    expect(findOrphans([app("1", "NuTag*BEI2A53", 2000)], [inv("Transação de NuTag", 2000)])).toEqual([]);
  });

  it("consome cada par uma vez: duas iguais no app x uma na fatura deixa uma órfã", () => {
    const rows = [app("1", "Aki Pao", 3054), app("2", "Aki Pao", 3054)];
    expect(findOrphans(rows, [inv("Aki Pao", 3054)]).map((o) => o.id)).toEqual(["2"]);
  });

  it("duas iguais nos dois lados não deixam órfã", () => {
    const rows = [app("1", "Aki Pao", 3054), app("2", "Aki Pao", 3054)];
    expect(findOrphans(rows, [inv("Aki Pao", 3054), inv("Aki Pao", 3054)])).toEqual([]);
  });

  it("pagamento de fatura não conta como par disponível", () => {
    const rows = [app("1", "Pagamento em 06 JUL", -1253560)];
    const lines: FaturaLine[] = [
      { dateISO: "2026-07-06", description: "Pagamento em 06 JUL", cents: -1253560, kind: "payment", installment: null },
    ];
    // A linha de pagamento não é importada, então nada no app deveria casar com ela.
    expect(findOrphans(rows, lines).map((o) => o.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/fatura-match.test.ts`
Expected: FAIL — `findOrphans` não exportada.

- [ ] **Step 3: Implementar em `lib/fatura-match.ts`**

```ts
export type AppRow = {
  id: string;
  description: string;
  cents: number;
  installment: { seq: number; count: number } | null;
};

/**
 * Linhas do app no mês da fatura que a fatura NÃO cobrou. Cada par é consumido
 * uma vez, então duas linhas iguais no app precisam de duas na fatura.
 *
 * O pagamento da fatura anterior fica fora do pool: ele não é importado, logo
 * nada no app deveria casar com ele.
 */
export function findOrphans(appRows: AppRow[], faturaLines: FaturaLine[]): AppRow[] {
  const pool = new Map<string, number>();
  for (const line of faturaLines) {
    if (line.kind === "payment") continue;
    const k = matchKey(line.description, line.cents);
    pool.set(k, (pool.get(k) ?? 0) + 1);
  }
  const orphans: AppRow[] = [];
  for (const row of appRows) {
    const k = matchKey(row.description, row.cents);
    const available = pool.get(k) ?? 0;
    if (available > 0) pool.set(k, available - 1);
    else orphans.push(row);
  }
  return orphans;
}
```

Acrescente ao import do topo do arquivo: `import type { FaturaLine } from "@/lib/fatura-core";`

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/fatura-match.test.ts`
Expected: PASS (19 testes).

- [ ] **Step 5: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/fatura-match.ts tests/fatura-match.test.ts
git commit -m "feat: detecção de órfãs — lançado no app e não cobrado na fatura"
```

---

### Task 3: Estado dos planos e cauda esperada

**Files:**
- Create: `lib/fatura-plan.ts`
- Create: `tests/fatura-plan.test.ts`
- Modify: `lib/fatura-core.ts` (exportar `planKey`)

**Interfaces:**
- Consumes: `planKey` de `@/lib/fatura-core`; `AppRow`, `readInstallment` de `@/lib/fatura-match`.
- Produces:
  - `type PlanState = { key: string; description: string; count: number; cents: number; chargedThrough: number }`
  - `faturaPlanStates(lines: FaturaLine[], orphans: AppRow[]): Map<string, PlanState>`
  - `expectedTail(state: PlanState, faturaMonth: string): { month: string; seq: number }[]`

- [ ] **Step 1: Exportar `planKey` de `lib/fatura-core.ts`**

Troque `function planKey(` por `export function planKey(`. Ela já existe e recebe
`(line: FaturaLine, installment: { seq: number; count: number })`; generalize a
assinatura para aceitar qualquer linha com descrição e valor:

```ts
/**
 * Chave do PLANO de parcelamento: loja + total de parcelas + valor por parcela.
 * … (comentário existente, mantido)
 */
export function planKey(row: { description: string; cents: number }, installment: { count: number }): string {
  const base = row.description
    .replace(/^Antecipada - /, "")
    .replace(NUBANK_MARKER_RE, "")
    .replace(BRADESCO_MARKER_RE, "");
  return [base, installment.count, row.cents].join("|");
}
```

Ajuste a chamada interna em `buildInstallmentSchedule` para `planKey(line, line.installment!)`.

- [ ] **Step 2: Escrever o teste que falha**

`tests/fatura-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faturaPlanStates, expectedTail } from "@/lib/fatura-plan";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import type { FaturaLine } from "@/lib/fatura-core";
import type { AppRow } from "@/lib/fatura-match";

function inv(description: string, cents: number, seq: number, count: number): FaturaLine {
  return { dateISO: "2026-07-05", description, cents, kind: "purchase", installment: { seq, count } };
}

describe("faturaPlanStates", () => {
  it("chargedThrough é a maior parcela cobrada", () => {
    const states = faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []);
    const s = [...states.values()][0];
    expect(s.chargedThrough).toBe(3);
    expect(s.count).toBe(6);
    expect(s.cents).toBe(92820);
  });

  it("quitação antecipada: chargedThrough vai até o fim", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const s = [...faturaPlanStates(lines, []).values()][0];
    expect(s.chargedThrough).toBe(10);
  });

  it("parcela órfã: o plano fica cobrado até a anterior (deslocamento)", () => {
    // A fatura não trouxe 3/6; o app tinha. Então o banco cobrou até a 2.
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const s = [...faturaPlanStates([], [orphan]).values()][0];
    expect(s.chargedThrough).toBe(2);
    expect(s.count).toBe(6);
  });

  it("órfã à vista não cria plano", () => {
    const orphan: AppRow = { id: "x", description: "Es Estacionamento", cents: 23000, installment: null };
    expect(faturaPlanStates([], [orphan]).size).toBe(0);
  });

  it("a fatura ganha da órfã quando as duas conhecem o plano", () => {
    const line = inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6);
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const s = [...faturaPlanStates([line], [orphan]).values()][0];
    expect(s.chargedThrough).toBe(3);
  });

  it("separa planos da mesma loja por valor da parcela", () => {
    const states = faturaPlanStates(
      [inv("Franciscana - Parcela 8/12", 1799, 8, 12), inv("Franciscana - Parcela 9/9", 3088, 9, 9)],
      [],
    );
    expect(states.size).toBe(2);
  });
});

describe("expectedTail", () => {
  it("projeta chargedThrough+1..count nos meses seguintes", () => {
    const [state] = [...faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []).values()];
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 4 },
      { month: "2026-10", seq: 5 },
      { month: "2026-11", seq: 6 },
    ]);
  });

  it("plano quitado tem cauda vazia", () => {
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const [state] = [...faturaPlanStates(lines, []).values()];
    expect(expectedTail(state, "2026-08")).toEqual([]);
  });

  it("parcela atrasada desloca: a cauda recomeça na parcela não cobrada", () => {
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const [state] = [...faturaPlanStates([], [orphan]).values()];
    expect(expectedTail(state, "2026-08")).toEqual([
      { month: "2026-09", seq: 3 },
      { month: "2026-10", seq: 4 },
      { month: "2026-11", seq: 5 },
      { month: "2026-12", seq: 6 },
    ]);
  });

  it("vira o ano", () => {
    const [state] = [...faturaPlanStates([inv("Loja - Parcela 1/3", 1000, 1, 3)], []).values()];
    expect(expectedTail(state, "2026-11").map((t) => t.month)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("faturaPlanStates — fatura real", () => {
  const text = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");
  const f = parseNubankFatura(text);
  if ("error" in f) throw new Error(f.error);

  it("77 planos distintos", () => {
    expect(faturaPlanStates(f.lines, []).size).toBe(77);
  });

  it("a cauda total bate com a projeção validada", () => {
    const states = faturaPlanStates(f.lines, []);
    const total = [...states.values()].reduce((a, s) => a + expectedTail(s, f.faturaMonth).length * s.cents, 0);
    expect(total).toBe(2002897);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/fatura-plan.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/fatura-plan"`.

- [ ] **Step 4: Criar `lib/fatura-plan.ts`**

```ts
/**
 * A fatura como ESTADO dos planos de parcelamento: ela diz qual parcela foi
 * cobrada, e disso decorre a cauda dos meses seguintes.
 *
 * Um único mecanismo cobre os três casos que antes eram especiais:
 *   normal            fatura mostra 8/12          → cauda 9..12
 *   quitação antecipada fatura mostra 10/10       → cauda vazia
 *   parcela atrasada  app tinha 3/6, fatura não  → cobrado até 2, cauda 3..6
 */
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { planKey, type FaturaLine } from "@/lib/fatura-core";
import type { AppRow } from "@/lib/fatura-match";

export type PlanState = {
  key: string;
  /** Descrição de referência, usada ao gerar as linhas da cauda. */
  description: string;
  count: number;
  /** Valor por parcela. */
  cents: number;
  /** Última parcela que o banco cobrou. */
  chargedThrough: number;
};

/**
 * Estado de cada plano. A FATURA manda: `chargedThrough` é a maior parcela que
 * ela cobrou. Plano que só aparece nas órfãs (o app esperava a parcela e o banco
 * não cobrou) entra como cobrado até a ANTERIOR — é o que produz o deslocamento.
 */
export function faturaPlanStates(lines: FaturaLine[], orphans: AppRow[]): Map<string, PlanState> {
  const states = new Map<string, PlanState>();
  for (const line of lines) {
    if (line.kind !== "purchase" || !line.installment) continue;
    const key = planKey(line, line.installment);
    const current = states.get(key);
    if (!current || line.installment.seq > current.chargedThrough) {
      states.set(key, {
        key,
        description: line.description.replace(/^Antecipada - /, ""),
        count: line.installment.count,
        cents: line.cents,
        chargedThrough: Math.max(line.installment.seq, current?.chargedThrough ?? 0),
      });
    }
  }
  for (const orphan of orphans) {
    if (!orphan.installment) continue; // à vista não é plano
    const key = planKey(orphan, orphan.installment);
    if (states.has(key)) continue; // a fatura já disse o estado; ela ganha
    states.set(key, {
      key,
      description: orphan.description,
      count: orphan.installment.count,
      cents: orphan.cents,
      chargedThrough: orphan.installment.seq - 1,
    });
  }
  return states;
}

/** "2026-08" + 1 → "2026-09". Exportada porque o aplicador (Task 5) também precisa. */
export function shiftMonthISO(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** As parcelas que ainda faltam, uma por mês a partir do mês seguinte ao da fatura. */
export function expectedTail(state: PlanState, faturaMonth: string): { month: string; seq: number }[] {
  const tail: { month: string; seq: number }[] = [];
  for (let seq = state.chargedThrough + 1; seq <= state.count; seq++) {
    tail.push({ month: shiftMonthISO(faturaMonth, seq - state.chargedThrough), seq });
  }
  return tail;
}
```

`lib/dates.ts` não tem helper de deslocar mês (três módulos já definem o seu em
privado), então este fica exportado aqui — a lógica de cauda é quem faz aritmética
de mês nesta feature.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/fatura-plan.test.ts`
Expected: PASS (12 testes). O caso "77 planos" e o total `2002897` vêm da medição
do PR #29 — se divergirem, o `planKey` mudou de comportamento; investigue em vez
de ajustar o número.

- [ ] **Step 6: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde, incluindo `tests/fatura-core.test.ts` e `tests/nubank-fatura.test.ts`
sem alteração.

- [ ] **Step 7: Commit**

```bash
git add lib/fatura-plan.ts tests/fatura-plan.test.ts lib/fatura-core.ts
git commit -m "feat: estado dos planos derivado da fatura"
```

---

### Task 4: Reconciliar a cauda dos meses futuros

O coração, e onde a dívida do PR #29 morre. Precisa preservar o que a fatura não
conhece — foi a falta disso que apagava R$ 941,04 de setembro.

**Files:**
- Modify: `lib/fatura-plan.ts`
- Modify: `tests/fatura-plan.test.ts`

**Interfaces:**
- Consumes: `PlanState`, `expectedTail` (Task 3); `AppRow`, `readInstallment`, `planKey`.
- Produces:
  - `type TailAction = { kind: "delete"; id: string } | { kind: "insert"; month: string; description: string; cents: number; seq: number; count: number }`
  - `reconcileTail(opts: { states: Map<string, PlanState>; faturaMonth: string; existingByMonth: Map<string, AppRow[]> }): TailAction[]`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `tests/fatura-plan.test.ts`:

```ts
import { reconcileTail, type TailAction } from "@/lib/fatura-plan";

function mabuState() {
  return faturaPlanStates([inv("Mabu Hotel - Parcela 3/6", 92820, 3, 6)], []);
}

describe("reconcileTail", () => {
  it("insere a cauda que falta", () => {
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: new Map() });
    expect(actions.filter((a) => a.kind === "insert")).toHaveLength(3);
    const set = actions.find((a) => a.kind === "insert" && a.month === "2026-09") as Extract<TailAction, { kind: "insert" }>;
    expect(set.seq).toBe(4);
    expect(set.cents).toBe(92820);
    expect(set.description).toBe("Mabu Hotel - Parcela 4/6");
  });

  it("não duplica o que já está certo", () => {
    const existing = new Map([
      ["2026-09", [{ id: "a", description: "Mabu Hotel - Parcela 4/6", cents: 92820, installment: { seq: 4, count: 6 } }]],
    ]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "insert" && a.month === "2026-09")).toBe(false);
    expect(actions.some((a) => a.kind === "delete" && a.id === "a")).toBe(false);
  });

  it("apaga parcela do plano fora da cauda — é a dívida do PR #29", () => {
    // Plano quitado antecipadamente: cauda vazia, mas o app ainda tem a parcela.
    const lines = [inv("Nescafe - Parcela 2/10", 3380, 2, 10)];
    for (let seq = 3; seq <= 10; seq++) lines.push(inv(`Antecipada - Nescafe - Parcela ${seq}/10`, 3380, seq, 10));
    const existing = new Map([
      ["2026-09", [{ id: "velha", description: "Nescafe - Parcela 3/10", cents: 3380, installment: { seq: 3, count: 10 } }]],
    ]);
    const actions = reconcileTail({
      states: faturaPlanStates(lines, []),
      faturaMonth: "2026-08",
      existingByMonth: existing,
    });
    expect(actions).toEqual([{ kind: "delete", id: "velha" }]);
  });

  it("move a parcela para o mês certo quando o plano desloca", () => {
    const orphan: AppRow = {
      id: "x",
      description: "Mabu Hotel - Parcela 3/6",
      cents: 92820,
      installment: { seq: 3, count: 6 },
    };
    const existing = new Map([
      ["2026-09", [{ id: "a", description: "Mabu Hotel - Parcela 4/6", cents: 92820, installment: { seq: 4, count: 6 } }]],
    ]);
    const actions = reconcileTail({
      states: faturaPlanStates([], [orphan]),
      faturaMonth: "2026-08",
      existingByMonth: existing,
    });
    // Setembro tinha a 4 e agora tem que ter a 3: apaga a 4, insere a 3.
    expect(actions).toContainEqual({ kind: "delete", id: "a" });
    const ins = actions.filter((a) => a.kind === "insert") as Extract<TailAction, { kind: "insert" }>[];
    expect(ins.map((i) => `${i.month}:${i.seq}`)).toEqual(["2026-09:3", "2026-10:4", "2026-11:5", "2026-12:6"]);
  });

  it("PRESERVA compra à vista em mês futuro", () => {
    // Regressão dos R$ 941,04: as compras do ciclo novo não podem sair.
    const existing = new Map([
      ["2026-09", [{ id: "vista", description: "Es Estacionamento", cents: 23000, installment: null }]],
    ]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "delete")).toBe(false);
  });

  it("PRESERVA plano que a fatura não conhece", () => {
    // Compra parcelada feita DEPOIS do fechamento: a fatura fechada não a lista.
    const existing = new Map([
      ["2026-09", [{ id: "nova", description: "Loja Nova - Parcela 1/5", cents: 5000, installment: { seq: 1, count: 5 } }]],
    ]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    expect(actions.some((a) => a.kind === "delete" && a.id === "nova")).toBe(false);
  });

  it("corrige valor divergente da parcela", () => {
    const existing = new Map([
      ["2026-09", [{ id: "a", description: "Mabu Hotel - Parcela 4/6", cents: 92800, installment: { seq: 4, count: 6 } }]],
    ]);
    const actions = reconcileTail({ states: mabuState(), faturaMonth: "2026-08", existingByMonth: existing });
    // Valor diferente ⇒ chave de plano diferente ⇒ a linha antiga não pertence
    // ao plano da fatura e sobrevive; a correta é inserida.
    expect(actions.some((a) => a.kind === "insert" && a.month === "2026-09")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/fatura-plan.test.ts`
Expected: FAIL — `reconcileTail` não exportada.

- [ ] **Step 3: Implementar em `lib/fatura-plan.ts`**

```ts
export type TailAction =
  | { kind: "delete"; id: string }
  | { kind: "insert"; month: string; description: string; cents: number; seq: number; count: number };

/** Descrição da parcela `seq` de um plano, no formato do marcador Nubank. */
function tailDescription(state: PlanState, seq: number): string {
  const base = state.description.replace(/ - Parcela \d+\/\d+$/, "").replace(/\(\d{2}\/\d{2}\)$/, "");
  return `${base} - Parcela ${seq}/${state.count}`;
}

/**
 * Acerta os meses FUTUROS para a cauda que a fatura implica: apaga a parcela do
 * plano que está no mês errado, insere a que falta.
 *
 * Toca SÓ linhas de planos que a fatura conhece. Compra à vista e plano que a
 * fatura não lista (compra feita depois do fechamento) sobrevivem intactos — foi
 * a falta desta garantia que apagava R$ 941,04 de setembro na regra por data.
 */
export function reconcileTail(opts: {
  states: Map<string, PlanState>;
  faturaMonth: string;
  existingByMonth: Map<string, AppRow[]>;
}): TailAction[] {
  const { states, faturaMonth, existingByMonth } = opts;

  // Onde cada plano DEVE ter parcela, por mês.
  const wanted = new Map<string, Map<string, number>>(); // planKey → month → seq
  for (const state of states.values()) {
    const byMonth = new Map<string, number>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) byMonth.set(month, seq);
    wanted.set(state.key, byMonth);
  }

  const actions: TailAction[] = [];
  const seen = new Map<string, Set<string>>(); // planKey → meses já cobertos no app

  for (const [month, rows] of existingByMonth) {
    if (month <= faturaMonth) continue; // o mês da fatura é tratado pelo replace
    for (const row of rows) {
      if (!row.installment) continue; // à vista: preserva
      const key = planKey(row, row.installment);
      const byMonth = wanted.get(key);
      if (!byMonth) continue; // plano que a fatura não conhece: preserva
      if (byMonth.get(month) === row.installment.seq) {
        (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(month);
        continue; // já está certo
      }
      actions.push({ kind: "delete", id: row.id });
    }
  }

  for (const state of states.values()) {
    const covered = seen.get(state.key) ?? new Set<string>();
    for (const { month, seq } of expectedTail(state, faturaMonth)) {
      if (covered.has(month)) continue;
      actions.push({
        kind: "insert",
        month,
        description: tailDescription(state, seq),
        cents: state.cents,
        seq,
        count: state.count,
      });
    }
  }
  return actions;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/fatura-plan.test.ts`
Expected: PASS (19 testes).

- [ ] **Step 5: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/fatura-plan.ts tests/fatura-plan.test.ts
git commit -m "feat: reconciliação da cauda dos planos nos meses futuros"
```

---

### Task 5: Ligar em `applyFaturaImport` e conferir contra produção

**Files:**
- Modify: `lib/fatura-import.ts`

**Interfaces:**
- Consumes: `findOrphans`, `readInstallment`, `type AppRow`; `faturaPlanStates`, `reconcileTail`.
- Produces: `applyFaturaImport` ganha `{ orphansMoved: number; tailActions: number }` no retorno.

- [ ] **Step 1: Substituir o corpo da reconstrução**

Em `lib/fatura-import.ts`, troque o laço `for (const month of monthsToRebuild)`
inteiro (do `deleteMany`/`findMany` até o `upsertCardEntry`) por:

```ts
  // ---- Órfãs: o app lançou e o banco não cobrou -----------------------------
  // Elas saem do mês da fatura (o replace já as removeu) e o plano a que
  // pertencem passa a contar como cobrado até a parcela anterior, o que desloca
  // a cauda. Órfã à vista vira lançamento do mês seguinte.
  const appRowsBefore: AppRow[] = beforeReplace.map((r) => ({
    id: r.id,
    description: r.description,
    cents: decimalToCents(String(r.amount)),
    installment: readInstallment(r),
  }));
  const orphans = findOrphans(appRowsBefore, lines);
  const nextMonth = shiftMonthISO(faturaMonth, 1);
  for (const orphan of orphans.filter((o) => !o.installment)) {
    await prisma.cardTransaction.create({
      data: {
        cardId: card.id,
        month: monthToDate(nextMonth),
        description: orphan.description,
        amount: centsToNumber(orphan.cents),
        purchaseDate: null,
      },
    });
  }

  // ---- Cauda dos planos ----------------------------------------------------
  const states = faturaPlanStates(lines, orphans);
  const future = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(faturaMonth) }, prepayment: false },
    select: { id: true, month: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const existingByMonth = new Map<string, AppRow[]>();
  for (const r of future) {
    const month = monthStringFromDate(r.month);
    const list = existingByMonth.get(month) ?? [];
    list.push({
      id: r.id,
      description: r.description,
      cents: decimalToCents(String(r.amount)),
      installment: readInstallment(r),
    });
    existingByMonth.set(month, list);
  }
  const actions = reconcileTail({ states, faturaMonth, existingByMonth });

  const doomed = actions.filter((a) => a.kind === "delete").map((a) => a.id);
  if (doomed.length > 0) await prisma.cardTransaction.deleteMany({ where: { id: { in: doomed } } });
  const inserts = actions.filter((a) => a.kind === "insert");
  if (inserts.length > 0) {
    await prisma.cardTransaction.createMany({
      data: inserts.map((a) => ({
        cardId: card.id,
        month: monthToDate(a.month),
        description: a.description,
        amount: centsToNumber(a.cents),
        installmentSeq: a.seq,
        installmentCount: a.count,
      })),
    });
  }

  // ---- Consolidados --------------------------------------------------------
  const touched = [
    ...new Set([nextMonth, ...actions.map((a) => (a.kind === "insert" ? a.month : "")).filter(Boolean), ...existingByMonth.keys()]),
  ].sort();
  for (const month of touched) {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(month) },
      _sum: { amount: true },
    });
    const totalCents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
    months.push({ month, totalCents });
  }
  return { months, orphansMoved: orphans.length, tailActions: actions.length };
```

Antes do `replaceCardMonth`, capture as linhas do mês para poder achar as órfãs:

```ts
  const beforeReplace = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: monthToDate(faturaMonth), prepayment: false },
    select: { id: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
```

Ajuste o tipo de retorno para
`Promise<{ months: { month: string; totalCents: number }[]; orphansMoved: number; tailActions: number }>`
e os imports: `findOrphans`, `readInstallment`, `type AppRow` de `@/lib/fatura-match`;
`faturaPlanStates`, `reconcileTail`, `shiftMonthISO` de `@/lib/fatura-plan`;
`monthStringFromDate` de `@/lib/dates`.

`ownedByRebuild` e `buildInstallmentSchedule` deixam de ser usadas AQUI, mas
`previewMonthsImpact` (`cartoes/actions.ts`) ainda chama as duas — **não remova
nada agora**. A Task 7 troca o preview e aí sim elas saem, junto dos testes.

- [ ] **Step 2: Typecheck e suíte**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: verde. Se `ownedByRebuild` ficou órfã, o lint acusa.

- [ ] **Step 3: Conferir contra produção, SEM gravar**

Crie `scripts/simula-fechamento-nubank.ts`, rode, e **confira o resultado antes de
seguir**. Ele não escreve nada:

```ts
// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { parseFatura } from "@/lib/fatura-parse";
import { findOrphans, readInstallment, type AppRow } from "@/lib/fatura-match";
import { faturaPlanStates, reconcileTail } from "@/lib/fatura-plan";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";

/** Simulação read-only do fechamento. Uso: npx tsx scripts/simula-fechamento-nubank.ts <caminho-do-pdf> */
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("informe o caminho do PDF da fatura");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const f = parseFatura((await extractText(pdf, { mergePages: true })).text);
  if ("error" in f) throw new Error(f.error);

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: f.bank, mode: "insensitive" } },
  });
  if (!card) throw new Error(`cartão ${f.bank} não encontrado`);

  const mesRows = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: monthToDate(f.faturaMonth), prepayment: false },
    select: { id: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const appRows: AppRow[] = mesRows.map((r) => ({
    id: r.id,
    description: r.description,
    cents: decimalToCents(String(r.amount)),
    installment: readInstallment(r),
  }));
  const orphans = findOrphans(appRows, f.lines);
  console.log(`${f.faturaMonth}: ${appRows.length} linhas no app, ${f.lines.length} na fatura`);
  console.log(`órfãs: ${orphans.length} (${formatCents(orphans.reduce((a, o) => a + o.cents, 0))})`);
  for (const o of orphans) console.log(`   ${o.description} ${formatCents(o.cents)}${o.installment ? " [parcela]" : ""}`);

  const states = faturaPlanStates(f.lines, orphans);
  const future = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gt: monthToDate(f.faturaMonth) }, prepayment: false },
    select: { id: true, month: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const existingByMonth = new Map<string, AppRow[]>();
  const centsById = new Map<string, number>();
  for (const r of future) {
    const m = monthStringFromDate(r.month);
    const c = decimalToCents(String(r.amount));
    centsById.set(r.id, c);
    const list = existingByMonth.get(m) ?? [];
    list.push({ id: r.id, description: r.description, cents: c, installment: readInstallment(r) });
    existingByMonth.set(m, list);
  }
  const actions = reconcileTail({ states, faturaMonth: f.faturaMonth, existingByMonth });

  console.log(`\n${states.size} planos · ${actions.length} ações na cauda\n`);
  const meses = [...new Set([...existingByMonth.keys(), ...actions.flatMap((a) => (a.kind === "insert" ? [a.month] : []))])].sort();
  for (const m of meses) {
    const antes = (existingByMonth.get(m) ?? []).reduce((a, r) => a + r.cents, 0);
    const del = actions.filter((a) => a.kind === "delete" && (existingByMonth.get(m) ?? []).some((r) => r.id === a.id));
    const ins = actions.filter((a) => a.kind === "insert" && a.month === m) as Extract<typeof actions[number], { kind: "insert" }>[];
    const depois = antes - del.reduce((a, d) => a + (centsById.get(d.id) ?? 0), 0) + ins.reduce((a, i) => a + i.cents, 0);
    console.log(`  ${m}: ${formatCents(antes)} → ${formatCents(depois)} (−${del.length} +${ins.length})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Run: `npx tsx scripts/simula-fechamento-nubank.ts <caminho-do-pdf-da-fatura>`

**Critério de aceite, medido no PR #29:** out/2026 tem que ficar em **R$ 5.197,94
± centavos**, NÃO em R$ 10.361,37. Setembro fica em ~R$ 7.658 preservando as 8
compras do ciclo novo. Agosto não aparece (é o replace). Se out/2026 dobrar, a
reconciliação não está reconhecendo os planos — pare e investigue o `planKey`
antes de gravar qualquer coisa.

- [ ] **Step 4: Commit**

```bash
git add lib/fatura-import.ts scripts/simula-fechamento-nubank.ts tests/fatura-core.test.ts
git commit -m "feat: importação reconcilia a cauda dos planos em vez de recriar"
```

---

### Task 6: Baixa de pagamento no import

**Files:**
- Modify: `app/(app)/cartoes/actions.ts`
- Modify: `app/(app)/cartoes/ImportFaturaDialog.tsx`

**Interfaces:**
- Consumes: `applyFaturaImport` (Task 5).
- Produces: `applyPayloadSchema` ganha `paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()`.

**Sem teste automatizado, de propósito.** O projeto não tem teste de server action
(não há mock de prisma em `tests/`), e inventar essa infra aqui seria escopo novo.
Verificação manual, no navegador: importar com data marca a fatura como paga no
valor do total; importar em branco deixa em aberto na tela do Mês.

- [ ] **Step 1: Aceitar a data no payload**

Em `applyPayloadSchema`, acrescente:

```ts
  // null = deixar a fatura em aberto; a baixa segue pela tela do Mês.
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
```

- [ ] **Step 2: Dar a baixa depois de aplicar**

Em `applyFatura`, depois do `applyFaturaImport` e antes do `revalidateFinance()`:

```ts
  // Baixa opcional: paidAmount é o TOTAL DA FATURA, não o consolidado
  // calculado — é o valor que o banco vai debitar. Divergência entre os dois já
  // aparece como aviso no preview.
  if (paidDate) {
    await prisma.monthlyEntry.updateMany({
      where: { cardId: card.id, month: monthToDate(faturaMonth), description: card.name },
      data: {
        paid: true,
        paidAmount: centsToNumber(totalCents),
        paidDate: new Date(paidDate + "T00:00:00Z"),
      },
    });
  }
```

Inclua `paidDate` e `totalCents` na desestruturação de `parsed.data` e importe
`centsToNumber` de `@/lib/money`.

- [ ] **Step 3: Campo de data no diálogo**

Em `ImportFaturaDialog.tsx`, no bloco do preview (antes do `DialogFooter` de
confirmação), acrescente o estado e o campo:

```tsx
const [paidDate, setPaidDate] = useState<string>("");
```

e, no JSX:

```tsx
<div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
  <label htmlFor="paidDate" className="text-muted-foreground">
    Data do pagamento
  </label>
  <Input
    id="paidDate"
    type="date"
    value={paidDate}
    onChange={(e) => setPaidDate(e.target.value)}
    className="h-8 w-40"
  />
  <Button type="button" variant="ghost" size="sm" onClick={() => setPaidDate(preview.dueDateISO)}>
    Usar o vencimento ({shortDate(preview.dueDateISO)})
  </Button>
  {paidDate === "" && <span className="text-xs text-muted-foreground">Em branco = fatura fica em aberto</span>}
</div>
```

e no objeto do `payload`, acrescente `paidDate: paidDate || null`.

- [ ] **Step 4: Typecheck, suíte e lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/cartoes/actions.ts" "app/(app)/cartoes/ImportFaturaDialog.tsx"
git commit -m "feat: baixa da fatura no momento da importação"
```

---

### Task 7: Detalhe no preview, docs, versão 1.4.0

**Files:**
- Modify: `app/(app)/cartoes/actions.ts` (detalhe no `monthsImpact`)
- Modify: `app/(app)/cartoes/ImportFaturaDialog.tsx`
- Modify: `docs/fatura-nubank.md`, `docs/log.md`, `package.json`, `lib/changelog.ts`

- [ ] **Step 1: Detalhar o impacto**

Acrescente `removed: number` e `added: number` ao tipo `monthsImpact` em
`FaturaPreview`, e substitua o corpo de `previewMonthsImpact` por — as MESMAS
funções do aplicador, senão o preview mente:

```ts
async function previewMonthsImpact(
  cardId: string,
  fatura: ParsedFatura,
): Promise<{ month: string; beforeCents: number; afterCents: number; removed: number; added: number }[]> {
  const mesRows = await prisma.cardTransaction.findMany({
    where: { cardId, month: monthToDate(fatura.faturaMonth), prepayment: false },
    select: { id: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const toAppRow = (r: {
    id: string;
    description: string;
    amount: unknown;
    installmentSeq: number | null;
    installmentCount: number | null;
  }): AppRow => ({
    id: r.id,
    description: r.description,
    cents: decimalToCents(String(r.amount)),
    installment: readInstallment(r),
  });

  const orphans = findOrphans(mesRows.map(toAppRow), fatura.lines);
  const states = faturaPlanStates(fatura.lines, orphans);
  const future = await prisma.cardTransaction.findMany({
    where: { cardId, month: { gt: monthToDate(fatura.faturaMonth) }, prepayment: false },
    select: { id: true, month: true, description: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const existingByMonth = new Map<string, AppRow[]>();
  const centsById = new Map<string, number>();
  for (const r of future) {
    const month = monthStringFromDate(r.month);
    const row = toAppRow(r);
    centsById.set(row.id, row.cents);
    existingByMonth.set(month, [...(existingByMonth.get(month) ?? []), row]);
  }
  const actions = reconcileTail({ states, faturaMonth: fatura.faturaMonth, existingByMonth });

  // Antecipações sobrevivem em todo mês; entram no antes e no depois.
  const prepay = await prisma.cardTransaction.groupBy({
    by: ["month"],
    where: { cardId, month: { gte: monthToDate(fatura.faturaMonth) }, prepayment: true },
    _sum: { amount: true },
  });
  const prepayByMonth = new Map(
    prepay.map((p) => [monthStringFromDate(p.month), p._sum.amount ? decimalToCents(String(p._sum.amount)) : 0]),
  );

  const nextMonth = shiftMonthISO(fatura.faturaMonth, 1);
  const orphanVistaCents = orphans.filter((o) => !o.installment).reduce((a, o) => a + o.cents, 0);
  const months = [
    ...new Set([
      fatura.faturaMonth,
      nextMonth,
      ...existingByMonth.keys(),
      ...actions.flatMap((a) => (a.kind === "insert" ? [a.month] : [])),
    ]),
  ].sort();

  const out = [];
  for (const month of months) {
    const rows = month === fatura.faturaMonth ? mesRows.map(toAppRow) : (existingByMonth.get(month) ?? []);
    const prepayCents = prepayByMonth.get(month) ?? 0;
    const beforeCents = rows.reduce((a, r) => a + r.cents, 0) + prepayCents;

    if (month === fatura.faturaMonth) {
      // replaceCardMonth: a fatura é a verdade do mês; só antecipação sobrevive.
      out.push({
        month,
        beforeCents,
        afterCents: sumFaturaLines(fatura.lines) + prepayCents,
        removed: rows.length,
        added: fatura.lines.filter((l) => l.kind !== "payment").length,
      });
      continue;
    }
    const ids = new Set(rows.map((r) => r.id));
    const removedActions = actions.filter((a) => a.kind === "delete" && ids.has(a.id));
    const addedActions = actions.filter((a) => a.kind === "insert" && a.month === month) as Extract<
      (typeof actions)[number],
      { kind: "insert" }
    >[];
    const removedCents = removedActions.reduce((a, d) => a + (centsById.get(d.id) ?? 0), 0);
    const addedCents = addedActions.reduce((a, i) => a + i.cents, 0);
    // As órfãs à vista caem no mês seguinte ao da fatura.
    const orphanCents = month === nextMonth ? orphanVistaCents : 0;
    out.push({
      month,
      beforeCents,
      afterCents: beforeCents - removedCents + addedCents + orphanCents,
      removed: removedActions.length,
      added: addedActions.length + (month === nextMonth ? orphans.filter((o) => !o.installment).length : 0),
    });
  }
  return out.filter((m) => m.beforeCents !== 0 || m.afterCents !== 0);
}
```

Chamada: `await previewMonthsImpact(cardId, fatura)`.

Imports a acrescentar em `cartoes/actions.ts`: `findOrphans`, `readInstallment`,
`type AppRow` de `@/lib/fatura-match`; `faturaPlanStates`, `reconcileTail`,
`shiftMonthISO` de `@/lib/fatura-plan`.

Agora `ownedByRebuild` e `buildInstallmentSchedule` ficaram sem uso em
`cartoes/actions.ts`. Remova-as dos imports; se `grep -rn "ownedByRebuild" lib app`
não achar mais nada, apague a função de `lib/fatura-core.ts` e o `describe`
`ownedByRebuild` de `tests/fatura-core.test.ts` — código morto com teste verde é
pior que código morto.

- [ ] **Step 2: Mostrar no diálogo**

Na lista de impacto, acrescente ao lado do valor:

```tsx
{(m.removed > 0 || m.added > 0) && (
  <span className="ml-1 text-muted-foreground">
    (−{m.removed} +{m.added})
  </span>
)}
```

- [ ] **Step 3: Atualizar `docs/fatura-nubank.md`**

Substitua a seção "Dívida aberta: duplicação nos meses futuros" por uma seção
"Fechamento: a fatura como estado dos planos", explicando: o casamento por
descrição canônica (prefixo `Antecipada - ` e a tabela de apelidos), as órfãs, e a
tabela dos três casos (normal / quitação antecipada / parcela atrasada) que o
mecanismo único cobre. Registre que a dívida da duplicação foi resolvida por aí, sem
script de limpeza.

- [ ] **Step 4: Linha no log**

Em `docs/log.md`:

```
2026-08-05 — added fechamento de fatura como estado dos planos: órfãs caminham para frente, cauda reconciliada por plano, dívida da duplicação resolvida sem limpeza
```

- [ ] **Step 5: Versão e changelog**

`package.json`: `"version": "1.4.0"`.

No topo do `CHANGELOG` em `lib/changelog.ts`:

```ts
  {
    version: "1.4.0",
    date: "2026-08-05",
    title: "Fechamento de fatura",
    items: [
      "Ao importar a fatura, o que você lançou e o banco não cobrou passa a ir para o mês seguinte sozinho, em vez de desaparecer.",
      "Parcela que o banco atrasou desloca o plano inteiro: as seguintes descem um mês e o plano termina um mês depois.",
      "Dá para dar baixa da fatura já na importação, informando a data do pagamento.",
      "O preview mostra quantas linhas entram e saem de cada mês antes de você confirmar.",
    ],
  },
```

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde. `tests/changelog.test.ts` valida a versão do topo.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/cartoes/actions.ts" "app/(app)/cartoes/ImportFaturaDialog.tsx" docs/fatura-nubank.md docs/log.md package.json lib/changelog.ts
git commit -m "chore: versão 1.4.0 e changelog"
```

---

## Verificação final

- [ ] `npm test` — 428 da baseline + ~43 novos
- [ ] `npx tsc --noEmit` — sem saída
- [ ] `npm run lint` — só os 4 warnings pré-existentes
- [ ] `npx tsx scripts/simula-fechamento-nubank.ts <pdf>` — out/2026 em ~R$ 5.197,94, **não** R$ 10.361,37
- [ ] `grep -rn "ownedByRebuild" lib app` — sem resultado, ou com uso real (não deixar código morto)
- [ ] `git status` — nenhum PDF/CSV de fatura no working tree
