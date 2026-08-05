# Fechamento de faturas pelo Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mandar o PDF da fatura fechada (Nubank ou Bradesco) no bot do Telegram e ter o mês travado no valor exato do banco, com as parcelas dos meses futuros reconstruídas.

**Architecture:** O importador (`applyBradescoFaturaImport`) já é agnóstico de banco — só o parser é específico. O plano extrai tipos e helpers puros para `lib/fatura-core.ts` (folha do grafo), acrescenta `lib/nubank-fatura.ts`, põe um dispatcher em `lib/fatura-parse.ts` e liga os dois consumidores (bot e web) nele. A validação é fail-closed: nada é gravado se a aritmética do próprio documento não fechar.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7 (Postgres), Vitest, `unpdf` para extrair texto de PDF, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-08-05-fechamento-faturas-telegram-design.md`

## Global Constraints

- **Dinheiro sempre em centavos inteiros.** Use `parseBRLToCents`, `formatCents`, `decimalToCents`, `centsToNumber` de `@/lib/money`. Nunca aritmética de float em valores.
- **Imports por alias `@/`** (configurado no `tsconfig.json`). Nunca caminho relativo entre pastas de topo.
- **Comentários em português**, explicando o *porquê* (a regra de negócio ou a armadilha), não o *o quê*. Siga a densidade dos arquivos vizinhos — `lib/fatura.ts` e `lib/bradesco-fatura.ts` são a referência de estilo.
- **Versão + changelog no mesmo commit:** `AGENTS.md` exige que todo PR que altera o app bumpe `version` no `package.json` e adicione a entrada em `lib/changelog.ts`. Alvo desta entrega: **1.3.0** (minor). `tests/changelog.test.ts` trava o sincronismo — a entrada mais recente do changelog tem que ser igual à `version`.
- **Negativos do Nubank usam U+2212 (`−`), não hífen ASCII.** Toda regex de valor do Nubank precisa aceitar `[−-]`. Constante compartilhada: `const MINUS = "[−-]"`.
- **Fail-closed:** qualquer divergência de transcrição aborta a importação e não grava nada. Divergência entre o total aplicado e o documento é só aviso.
- **Nunca commitar PDF ou CSV de fatura** — contêm nome do titular, do adicional e dígitos de cartão. A fixture `tests/fixtures/nubank-fatura.txt` já está anonimizada e commitada.
- Rodar `npm test` (Vitest, 384 testes na baseline), `npx tsc --noEmit` e `npm run lint` antes de cada commit. O lint tem 4 warnings pré-existentes em `app/(app)/dashboard/page.tsx` e `app/(app)/investimentos/actions.ts` — não são seus, não conte como regressão.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/fatura-core.ts` *(criar)* | Tipos (`FaturaLine`, `FaturaLineKind`, `FaturaBank`, `ParsedFatura`) e helpers puros sobre linhas: `sumFaturaLines`, `buildInstallmentSchedule`. Folha do grafo — não importa parser nenhum. |
| `lib/bradesco-fatura.ts` *(modificar)* | Parser Bradesco. Passa a importar tipos e helpers de `fatura-core`; perde as definições que migraram. |
| `lib/nubank-fatura.ts` *(criar)* | Parser Nubank. |
| `lib/fatura-parse.ts` *(criar)* | `detectFaturaBank` + `parseFatura`. Importa os dois parsers. |
| `lib/fatura-import.ts` *(renomear de `lib/bradesco-import.ts`)* | `applyFaturaImport`. Corpo praticamente inalterado — só o nome e a chamada do cronograma. |
| `app/api/telegram/route.ts` *(modificar)* | Handler de `.pdf`; guard do CSV; texto do `HELP`. |
| `app/(app)/cartoes/actions.ts` *(modificar)* | `previewFatura` / `applyFatura` chamando `parseFatura`; `bank` e `expectedLinesCents` no payload. |
| `app/(app)/cartoes/ImportFaturaDialog.tsx` *(modificar)* | Acompanha o renome das actions e o campo novo do payload. |
| `tests/fatura-core.test.ts` *(criar)* | Agrupamento por plano e `sumFaturaLines`. |
| `tests/nubank-fatura.test.ts` *(criar)* | Parser Nubank sobre a fixture. |
| `tests/fatura-parse.test.ts` *(criar)* | Dispatcher. |
| `tests/csv-fatura-guard.test.ts` *(criar)* | Guard do mês majoritário. |

---

### Task 1: `lib/fatura-core.ts` — tipos e cronograma agrupado por plano

O coração da correção: `buildInstallmentSchedule` hoje projeta `seq+1..count` para **cada linha**, e isso duplica quando a fatura cobra mais de uma parcela do mesmo plano (quitação antecipada do Nubank). Medido no spec: R$ 26.234,86 projetados contra R$ 20.969,07 reais.

**Files:**
- Create: `lib/fatura-core.ts`
- Create: `tests/fatura-core.test.ts`
- Modify: `lib/bradesco-fatura.ts` (remover definições migradas, importar de `fatura-core`)
- Modify: `lib/bradesco-import.ts:5` (import de `FaturaLine` e `buildInstallmentSchedule`)

**Interfaces:**
- Consumes: `monthToDate`, `monthStringFromDate` de `@/lib/dates`.
- Produces:
  - `type FaturaLineKind = "purchase" | "refund" | "payment"`
  - `type FaturaBank = "nubank" | "bradesco"`
  - `type FaturaLine = { dateISO: string; description: string; cents: number; kind: FaturaLineKind; installment: { seq: number; count: number } | null }`
  - `type ParsedFatura = { bank; faturaMonth; dueDateISO; closingISO; totalCents; expectedLinesCents; limitCents; upcoming; lines; warnings }`
  - `sumFaturaLines(lines: FaturaLine[]): number`
  - `buildInstallmentSchedule(lines: FaturaLine[], faturaMonth: string, bank: FaturaBank): Map<string, { dateISO: string; description: string; cents: number }[]>`

- [ ] **Step 1: Escrever o teste que falha**

`tests/fatura-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sumFaturaLines, buildInstallmentSchedule, type FaturaLine } from "@/lib/fatura-core";

function line(partial: Partial<FaturaLine> & { description: string; cents: number }): FaturaLine {
  return {
    dateISO: "2026-07-05",
    kind: "purchase",
    installment: null,
    ...partial,
  };
}

describe("sumFaturaLines", () => {
  it("soma compras e estornos e ignora pagamento de fatura", () => {
    const lines = [
      line({ description: "Mercado", cents: 10000 }),
      line({ description: "Estorno", cents: -2500, kind: "refund" }),
      line({ description: "Pagamento em 06 JUL", cents: -50000, kind: "payment" }),
    ];
    expect(sumFaturaLines(lines)).toBe(7500);
  });
});

describe("buildInstallmentSchedule", () => {
  it("projeta pp+1..tt a partir da parcela cobrada", () => {
    const lines = [
      line({ description: "Loja - Parcela 2/4", cents: 5000, installment: { seq: 2, count: 4 } }),
    ];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    expect([...schedule.keys()].sort()).toEqual(["2026-09", "2026-10"]);
    expect(schedule.get("2026-09")![0].description).toBe("Loja - Parcela 3/4");
    expect(schedule.get("2026-10")![0].description).toBe("Loja - Parcela 4/4");
  });

  it("agrupa por plano: quitação antecipada não projeta parcela já paga", () => {
    // O Nubank cobra a parcela normal + todas as antecipadas no mesmo ciclo.
    // Projetar por linha recriaria 3..10 a partir da 2, 4..10 a partir da 3, etc.
    const lines: FaturaLine[] = [
      line({ description: "Nescafe - Parcela 2/10", cents: 3380, installment: { seq: 2, count: 10 } }),
    ];
    for (let seq = 3; seq <= 10; seq++) {
      lines.push(
        line({ description: `Antecipada - Nescafe - Parcela ${seq}/10`, cents: 3380, installment: { seq, count: 10 } }),
      );
    }
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    expect(schedule.size).toBe(0);
  });

  it("separa planos da mesma loja por valor da parcela", () => {
    const lines = [
      line({ description: "Franciscana - Parcela 8/12", cents: 1799, installment: { seq: 8, count: 12 } }),
      line({ description: "Franciscana - Parcela 9/9", cents: 3088, installment: { seq: 9, count: 9 } }),
    ];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "nubank");
    // Só o plano de 12x tem futuro (9..12); o de 9x terminou.
    expect([...schedule.keys()].sort()).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(schedule.get("2026-09")!.map((r) => r.cents)).toEqual([1799]);
  });

  it("reescreve o marcador no formato do Bradesco", () => {
    const lines = [
      line({ description: "AMAZON BR SAO PAULO(09/12)", cents: 1594, installment: { seq: 9, count: 12 } }),
    ];
    const schedule = buildInstallmentSchedule(lines, "2026-08", "bradesco");
    expect(schedule.get("2026-09")![0].description).toBe("AMAZON BR SAO PAULO(10/12)");
  });

  it("estorno e pagamento não projetam nada", () => {
    const lines = [
      line({ description: "Estorno - Parcela 1/5", cents: -5000, kind: "refund", installment: { seq: 1, count: 5 } }),
      line({ description: "Pagamento em 06 JUL", cents: -50000, kind: "payment", installment: null }),
    ];
    expect(buildInstallmentSchedule(lines, "2026-08", "bradesco").size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/fatura-core.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/fatura-core"`.

- [ ] **Step 3: Criar `lib/fatura-core.ts`**

```ts
/**
 * Núcleo compartilhado da importação de faturas: tipos e helpers puros sobre
 * linhas de lançamento, sem dependência de parser nem de prisma.
 *
 * É FOLHA do grafo de imports de propósito: os parsers precisam de
 * `sumFaturaLines` para a própria checagem de transcrição, e `fatura-parse`
 * importa os parsers — pôr estes helpers lá fecharia um ciclo.
 */
import { monthToDate, monthStringFromDate } from "@/lib/dates";

export type FaturaLineKind = "purchase" | "refund" | "payment";

export type FaturaBank = "nubank" | "bradesco";

export type FaturaLine = {
  dateISO: string;
  description: string;
  /** Negativo em refund/payment. */
  cents: number;
  kind: FaturaLineKind;
  installment: { seq: number; count: number } | null;
};

export type ParsedFatura = {
  bank: FaturaBank;
  /** Competência = mês do vencimento (YYYY-MM). */
  faturaMonth: string;
  dueDateISO: string;
  closingISO: string;
  /** "Total a pagar" (Nubank) / "Total da fatura" (Bradesco). */
  totalCents: number;
  /**
   * Soma que as linhas purchase+refund TÊM que dar. No Bradesco é igual a
   * `totalCents`; no Nubank é maior, porque a antecipação do meio do ciclo
   * entra no "Pagamento recebido" do resumo e vive no banco como
   * CardTransaction.prepayment.
   */
  expectedLinesCents: number;
  limitCents: number | null;
  /** Números que o banco projeta para as próximas faturas (informativo). */
  upcoming: { nextCents: number; totalCents: number } | null;
  lines: FaturaLine[];
  warnings: string[];
};

/** Soma líquida dos lançamentos SEM o pagamento da fatura anterior. */
export function sumFaturaLines(lines: FaturaLine[]): number {
  return lines.filter((l) => l.kind !== "payment").reduce((acc, l) => acc + l.cents, 0);
}

const BRADESCO_MARKER_RE = /\((\d{2})\/(\d{2})\)/;
const NUBANK_MARKER_RE = / - Parcela (\d+)\/(\d+)$/;

/** Reescreve o marcador da parcela na descrição, no formato de cada banco. */
function renumber(description: string, seq: number, count: number, bank: FaturaBank): string {
  if (bank === "bradesco") {
    return description.replace(
      BRADESCO_MARKER_RE,
      `(${String(seq).padStart(2, "0")}/${String(count).padStart(2, "0")})`,
    );
  }
  return description.replace(NUBANK_MARKER_RE, ` - Parcela ${seq}/${count}`);
}

/**
 * Chave do PLANO de parcelamento: loja + total de parcelas + valor por parcela.
 * O prefixo "Antecipada - " sai da chave porque a parcela antecipada pertence ao
 * mesmo plano da parcela normal. O valor entra porque a mesma loja pode ter dois
 * planos simultâneos (na fatura-modelo, Associacao Franciscana tem 9x R$ 30,88 e
 * 12x R$ 17,99).
 */
function planKey(line: FaturaLine): string {
  const base = line.description
    .replace(/^Antecipada - /, "")
    .replace(NUBANK_MARKER_RE, "")
    .replace(BRADESCO_MARKER_RE, "");
  return [base, line.installment!.count, line.cents].join("|");
}

function shiftMonthISO(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/**
 * Parcelas futuras: para cada PLANO, projeta a partir da MAIOR parcela cobrada
 * nesta fatura — as anteriores já foram pagas, inclusive as antecipadas, que o
 * Nubank cobra todas no mesmo ciclo. Projetar por linha duplicaria: na
 * fatura-modelo daria R$ 26.234,86 em vez de R$ 20.028,97.
 *
 * Estorno e pagamento não projetam nada (estorno de parcelado cancela o plano
 * inteiro — regra validada contra o "Total parcelado" do PDF do Bradesco).
 */
export function buildInstallmentSchedule(
  lines: FaturaLine[],
  faturaMonth: string,
  bank: FaturaBank,
): Map<string, { dateISO: string; description: string; cents: number }[]> {
  const plans = new Map<string, FaturaLine>();
  for (const line of lines) {
    if (line.kind !== "purchase" || !line.installment) continue;
    const key = planKey(line);
    const current = plans.get(key);
    if (!current || line.installment.seq > current.installment!.seq) plans.set(key, line);
  }

  const byMonth = new Map<string, { dateISO: string; description: string; cents: number }[]>();
  for (const line of plans.values()) {
    const { seq, count } = line.installment!;
    for (let k = seq + 1; k <= count; k++) {
      const month = shiftMonthISO(faturaMonth, k - seq);
      const list = byMonth.get(month) ?? [];
      list.push({ dateISO: line.dateISO, description: renumber(line.description, k, count, bank), cents: line.cents });
      byMonth.set(month, list);
    }
  }
  return byMonth;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/fatura-core.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Apontar `bradesco-fatura.ts` para o núcleo**

Em `lib/bradesco-fatura.ts`: **apague** as declarações de `FaturaLineKind`, `FaturaLine` e as funções `sumFaturaLines` e `buildInstallmentSchedule` (linhas 10–19 e 155–186 do arquivo atual), e troque o bloco de imports do topo por:

```ts
import { parseBRLToCents, formatCents } from "@/lib/money";
import { normalizeDescription } from "@/lib/description-match";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { buildInstallmentSchedule, sumFaturaLines, type FaturaLine } from "@/lib/fatura-core";

export { sumFaturaLines } from "@/lib/fatura-core";
export type { FaturaLine, FaturaLineKind } from "@/lib/fatura-core";
```

Ajuste `scheduleWarnings` para passar o banco:

```ts
const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth, "bradesco");
```

Mantenha `BradescoFatura` como está nesta task — a Task 3 substitui por `ParsedFatura`.

Em `lib/bradesco-import.ts:5`, troque:

```ts
import { buildInstallmentSchedule, type FaturaLine } from "@/lib/fatura-core";
```

e na chamada dentro de `applyBradescoFaturaImport`:

```ts
const schedule = buildInstallmentSchedule(lines, faturaMonth, "bradesco");
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. **`tests/bradesco-fatura.test.ts` tem que passar sem alterar nenhuma asserção** — é a rede de segurança do agrupamento. A fixture do Bradesco tem 45 planos e nenhum com duas parcelas na mesma fatura, então o agrupamento é no-op ali. Se algum teste do Bradesco falhar, o agrupamento está errado — não "conserte" o teste.

- [ ] **Step 7: Typecheck e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc sem saída; lint com os 4 warnings pré-existentes e nenhum novo.

- [ ] **Step 8: Commit**

```bash
git add lib/fatura-core.ts tests/fatura-core.test.ts lib/bradesco-fatura.ts lib/bradesco-import.ts
git commit -m "refactor: núcleo compartilhado de fatura e cronograma agrupado por plano"
```

---

### Task 2: `lib/nubank-fatura.ts` — parser da fatura fechada do Nubank

**Files:**
- Create: `lib/nubank-fatura.ts`
- Create: `tests/nubank-fatura.test.ts`
- Usa: `tests/fixtures/nubank-fatura.txt` (já commitada, 417 linhas, anonimizada)

**Interfaces:**
- Consumes: `FaturaLine`, `ParsedFatura`, `sumFaturaLines` de `@/lib/fatura-core`; `parseBRLToCents`, `formatCents` de `@/lib/money`.
- Produces: `parseNubankFatura(text: string): ParsedFatura | { error: string }`

**Valores de referência da fixture** (todos verificados por prototipagem):

| O que | Valor |
|---|---|
| `dueDateISO` | `2026-08-12` |
| `faturaMonth` | `2026-08` |
| `closingISO` | `2026-08-05` |
| `totalCents` | `1788429` |
| `expectedLinesCents` | `1833954` |
| `limitCents` | `5155000` |
| `upcoming.nextCents` | `765756` |
| `upcoming.totalCents` | `2096907` |
| linhas | 230 total: 222 `purchase`, 6 `refund`, 2 `payment` |
| linhas com `installment` | 102 |
| planos distintos | 77 |
| total projetado futuro | `2002897` |

- [ ] **Step 1: Escrever o teste que falha**

`tests/nubank-fatura.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import { sumFaturaLines, buildInstallmentSchedule } from "@/lib/fatura-core";

const text = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");

function parsed() {
  const r = parseNubankFatura(text);
  if ("error" in r) throw new Error(`parse falhou: ${r.error}`);
  return r;
}

describe("parseNubankFatura — cabeçalho e resumo", () => {
  it("lê vencimento, competência e fechamento", () => {
    const f = parsed();
    expect(f.bank).toBe("nubank");
    expect(f.dueDateISO).toBe("2026-08-12");
    expect(f.faturaMonth).toBe("2026-08");
    // Fechamento corrente = próximo fechamento (05 SET) menos 1 mês.
    expect(f.closingISO).toBe("2026-08-05");
  });

  it("lê o Total a pagar sem confundir com o detalhe do parcelamento", () => {
    // O documento tem "Total a pagar: R$ 83,74" no detalhe de uma parcela
    // financiada e "Total a pagar" como rótulo solto na tabela de opções.
    expect(parsed().totalCents).toBe(1788429);
  });

  it("lê o limite da página 1, não a coluna Disponível da página 4", () => {
    expect(parsed().limitCents).toBe(5155000);
  });

  it("expõe os saldos em aberto do banco", () => {
    expect(parsed().upcoming).toEqual({ nextCents: 765756, totalCents: 2096907 });
  });

  it("deriva expectedLinesCents do resumo", () => {
    // compras 18.446,11 + IOF 0,55 − outros 107,12 = 18.339,54
    expect(parsed().expectedLinesCents).toBe(1833954);
  });
});

describe("parseNubankFatura — linhas", () => {
  it("extrai todas as linhas, classificadas", () => {
    const f = parsed();
    expect(f.lines).toHaveLength(230);
    expect(f.lines.filter((l) => l.kind === "purchase")).toHaveLength(222);
    expect(f.lines.filter((l) => l.kind === "refund")).toHaveLength(6);
    expect(f.lines.filter((l) => l.kind === "payment")).toHaveLength(2);
  });

  it("fecha o invariante de transcrição", () => {
    const f = parsed();
    expect(sumFaturaLines(f.lines)).toBe(f.expectedLinesCents);
  });

  it("lê o valor deslocado da compra internacional", () => {
    // "16 JUL •••• 0000 Interserver.Net" / "USD 3.00" / "Conversão: …" / "R$ 15,75"
    const line = parsed().lines.find((l) => l.description === "Interserver.Net");
    expect(line).toBeDefined();
    expect(line!.cents).toBe(1575);
    expect(line!.kind).toBe("purchase");
  });

  it("lê o valor deslocado da parcela financiada", () => {
    // "05 JUL Privalia Br I - Parcela 4/4" + 2 linhas de detalhe + "R$ 20,94"
    const line = parsed().lines.find((l) => l.description === "Privalia Br I - Parcela 4/4");
    expect(line).toBeDefined();
    expect(line!.cents).toBe(2094);
    expect(line!.installment).toEqual({ seq: 4, count: 4 });
  });

  it("reconhece negativo com o sinal U+2212", () => {
    const credito = parsed().lines.find((l) => l.description.startsWith("Crédito de"));
    expect(credito).toBeDefined();
    expect(credito!.cents).toBeLessThan(0);
    expect(credito!.kind).toBe("refund");
  });

  it("classifica pagamento de fatura como payment e confere com o resumo", () => {
    const payments = parsed().lines.filter((l) => l.kind === "payment");
    expect(payments.map((p) => p.cents).sort((a, b) => a - b)).toEqual([-1253560, -45525]);
  });

  it("aceita linha sem cartão mascarado (NuPay/NuTag)", () => {
    const nupay = parsed().lines.filter((l) => l.description.includes("NuPay"));
    expect(nupay.length).toBeGreaterThan(0);
    expect(nupay.every((l) => !l.description.startsWith("••"))).toBe(true);
  });

  it("tira o prefixo do cartão mascarado da descrição", () => {
    expect(parsed().lines.every((l) => !/^[•\d]/.test(l.description))).toBe(true);
  });

  it("ignora subtotal por pessoa, cabeçalho de página e saldo restante", () => {
    const descriptions = parsed().lines.map((l) => l.description);
    expect(descriptions).not.toContain("Titular Exemplo");
    expect(descriptions.some((d) => d.includes("TRANSAÇÕES"))).toBe(false);
    expect(descriptions.some((d) => d.includes("Saldo restante"))).toBe(false);
  });

  it("marca as parcelas", () => {
    expect(parsed().lines.filter((l) => l.installment)).toHaveLength(102);
  });
});

describe("parseNubankFatura — cronograma", () => {
  it("projeta as parcelas futuras agrupadas por plano", () => {
    const f = parsed();
    const schedule = buildInstallmentSchedule(f.lines, f.faturaMonth, "nubank");
    const total = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
    // Projeção por linha daria 2623486 (parcelas antecipadas contadas de novo).
    expect(total).toBe(2002897);
  });

  it("quitação antecipada não deixa parcela futura", () => {
    const f = parsed();
    const schedule = buildInstallmentSchedule(f.lines, f.faturaMonth, "nubank");
    const nescafe = [...schedule.values()].flat().filter((r) => r.description.includes("Nescafe"));
    expect(nescafe).toHaveLength(0);
  });
});

describe("parseNubankFatura — rejeição", () => {
  it("recusa texto que não é fatura Nubank", () => {
    const r = parseNubankFatura("qualquer coisa\nsem âncora nenhuma");
    expect(r).toHaveProperty("error");
  });

  it("recusa quando a identidade do resumo não fecha", () => {
    const quebrado = text.replace("Total a pagar R$ 17.884,29", "Total a pagar R$ 99.999,99");
    const r = parseNubankFatura(quebrado);
    expect(r).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/nubank-fatura.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/nubank-fatura"`.

- [ ] **Step 3: Criar `lib/nubank-fatura.ts`**

```ts
/**
 * Parser da fatura FECHADA do Nubank (texto extraído via unpdf). Layout e
 * regras em `docs/fatura-nubank.md`. Puro — sem prisma — para os testes rodarem
 * sobre o texto real (fixture anonimizada em tests/fixtures/nubank-fatura.txt).
 */
import { parseBRLToCents, formatCents } from "@/lib/money";
import { sumFaturaLines, type FaturaLine, type ParsedFatura } from "@/lib/fatura-core";

/** Negativos do Nubank usam U+2212, não hífen ASCII. Aceita os dois. */
const MINUS = "[−-]";

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const DUE_RE = /^Data de vencimento: (\d{2}) ([A-Z]{3}) (\d{4})$/m;
const NEXT_CLOSING_RE = /^Fechamento da pr[óo]xima fatura (\d{2}) ([A-Z]{3}) (\d{4})$/m;
const PERIOD_RE = /^Per[íi]odo vigente: \d{2} [A-Z]{3} a (\d{2}) ([A-Z]{3})$/m;
// ANCORADO na linha e SEM dois-pontos: o detalhe de uma parcela financiada traz
// "Total a pagar: R$ 83,74" e a tabela de opções traz "Total a pagar" solto.
const TOTAL_RE = /^Total a pagar R\$ ([\d.,]+)$/m;
const PREVIOUS_RE = /^Fatura anterior R\$ ([\d.,]+)$/m;
const RECEIVED_RE = new RegExp(`^Pagamento recebido ${MINUS}R\\$ ([\\d.,]+)$`, "m");
const PURCHASES_RE = /^Total de compras de todos os cart[õo]es.* R\$ ([\d.,]+)$/m;
const IOF_RE = /^IOF de compras internacionais R\$ ([\d.,]+)$/m;
const OTHERS_RE = new RegExp(`^Outros lan[çc]amentos (${MINUS})?R\\$ ([\\d.,]+)$`, "m");
// Página 1. NÃO usar "LIMITES DISPONÍVEIS" da página 4: a coluna "Disponível"
// repete o limite total, não o disponível de fato.
const LIMIT_RE = /^Limite total do cart[ãa]o de cr[ée]dito: R\$ ([\d.,]+)$/m;
const NEXT_OPEN_RE = /^Saldo em aberto da pr[óo]xima fatura R\$ ([\d.,]+)$/m;
const TOTAL_OPEN_RE = /^Saldo em aberto total R\$ ([\d.,]+)$/m;

const LINE_WITH_VALUE = new RegExp(`^(\\d{2}) ([A-Z]{3}) (.+?) (${MINUS})?R\\$ ([\\d.,]+)$`);
const LINE_NO_VALUE = /^(\d{2}) ([A-Z]{3}) (.+)$/;
const ONLY_VALUE = new RegExp(`^(${MINUS})?R\\$ ([\\d.,]+)$`);
const CARD_PREFIX_RE = /^•+\s*\d{4}\s+/;
const PARCELA_RE = / - Parcela (\d+)\/(\d+)$/;
const PAYMENT_RE = /^Pagamento em \d{2} [A-Z]{3}$/;
const CARRY_RE = /^Saldo restante da fatura anterior$/;

/** Quantas linhas adiante procurar o valor deslocado (câmbio, detalhe de parcela). */
const VALUE_LOOKAHEAD = 4;

function money(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? parseBRLToCents(m[m.length - 1]) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function parseNubankFatura(text: string): ParsedFatura | { error: string } {
  const due = DUE_RE.exec(text);
  const totalCents = money(text, TOTAL_RE);
  const previousCents = money(text, PREVIOUS_RE);
  const receivedCents = money(text, RECEIVED_RE);
  const purchasesCents = money(text, PURCHASES_RE);
  const iofCents = money(text, IOF_RE);
  const othersMatch = OTHERS_RE.exec(text);

  if (
    !due || !MONTHS[due[2]] ||
    totalCents === null || previousCents === null || receivedCents === null ||
    purchasesCents === null || iofCents === null || !othersMatch
  ) {
    return { error: "Não parece uma fatura Nubank (PDF sem as âncoras esperadas)." };
  }
  const othersCents = othersMatch[1] ? -parseBRLToCents(othersMatch[2]) : parseBRLToCents(othersMatch[2]);

  const dueDateISO = `${due[3]}-${pad(MONTHS[due[2]])}-${due[1]}`;
  const faturaMonth = dueDateISO.slice(0, 7);

  // Fechamento corrente = próximo fechamento − 1 mês; sem a âncora, usa o fim
  // do "Período vigente".
  const nextClosing = NEXT_CLOSING_RE.exec(text);
  const period = PERIOD_RE.exec(text);
  let closingISO: string;
  if (nextClosing && MONTHS[nextClosing[2]]) {
    const s = shiftMonth(Number(nextClosing[3]), MONTHS[nextClosing[2]], -1);
    closingISO = `${s.year}-${pad(s.month)}-${nextClosing[1]}`;
  } else if (period && MONTHS[period[2]]) {
    closingISO = `${due[3]}-${pad(MONTHS[period[2]])}-${period[1]}`;
  } else {
    return { error: "Fatura Nubank sem data de fechamento identificável." };
  }
  const closingMonth = Number(closingISO.slice(5, 7));
  const closingYear = Number(closingISO.slice(0, 4));

  // Checagem 1: identidade do próprio resumo.
  const identity = previousCents - receivedCents + purchasesCents + iofCents + othersCents;
  if (identity !== totalCents) {
    return {
      error: `O resumo da fatura não fecha: ${formatCents(identity)} vs Total a pagar ${formatCents(totalCents)} — importação abortada.`,
    };
  }

  // Checagem 2: as duas rotas para o total esperado das linhas têm que concordar.
  const routeA = purchasesCents + iofCents + othersCents;
  const routeB = totalCents + receivedCents - previousCents;
  if (routeA !== routeB) {
    return {
      error: `Resumo inconsistente (${formatCents(routeA)} vs ${formatCents(routeB)}) — importação abortada.`,
    };
  }
  const expectedLinesCents = routeA;

  // --- Linhas -------------------------------------------------------------
  const rawLines = text.split("\n").map((l) => l.trim());
  const lines: FaturaLine[] = [];

  const isEntryStart = (s: string): boolean => {
    const m = LINE_NO_VALUE.exec(s);
    return m !== null && MONTHS[m[2]] !== undefined;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    let dd: string;
    let mmm: string;
    let description: string;
    let negative: boolean;
    let abs: number;

    const withValue = LINE_WITH_VALUE.exec(raw);
    if (withValue && MONTHS[withValue[2]]) {
      [, dd, mmm, description] = withValue;
      negative = withValue[4] !== undefined;
      abs = parseBRLToCents(withValue[5]);
    } else {
      if (!isEntryStart(raw)) continue;
      // Valor deslocado: a compra internacional e a parcela financiada põem o
      // valor algumas linhas adiante, depois do câmbio / do detalhe do plano.
      const noValue = LINE_NO_VALUE.exec(raw)!;
      let found: RegExpExecArray | null = null;
      for (let j = i + 1; j < Math.min(i + 1 + VALUE_LOOKAHEAD, rawLines.length); j++) {
        if (isEntryStart(rawLines[j])) break;
        const only = ONLY_VALUE.exec(rawLines[j]);
        if (only) {
          found = only;
          i = j; // consome as linhas de detalhe
          break;
        }
      }
      if (!found) continue;
      [, dd, mmm, description] = noValue;
      negative = found[1] !== undefined;
      abs = parseBRLToCents(found[2]);
    }

    description = description.replace(CARD_PREFIX_RE, "").trim();
    if (CARRY_RE.test(description)) continue; // "Saldo restante da fatura anterior R$ 0,00"

    // Compra num mês depois do fechamento no calendário = ano anterior.
    const month = MONTHS[mmm];
    const year = month > closingMonth ? closingYear - 1 : closingYear;
    const marker = PARCELA_RE.exec(description);
    const isPayment = PAYMENT_RE.test(description);

    lines.push({
      dateISO: `${year}-${pad(month)}-${dd}`,
      description,
      cents: negative ? -abs : abs,
      kind: isPayment ? "payment" : negative ? "refund" : "purchase",
      installment: marker ? { seq: Number(marker[1]), count: Number(marker[2]) } : null,
    });
  }

  if (lines.length === 0) return { error: "Nenhum lançamento encontrado na fatura." };

  // Checagem 3: transcrição.
  const sum = sumFaturaLines(lines);
  if (sum !== expectedLinesCents) {
    return {
      error: `A soma dos lançamentos (${formatCents(sum)}) não bate com o esperado pelo resumo (${formatCents(expectedLinesCents)}) — importação abortada.`,
    };
  }

  // Checagem 4: só aviso — a seção "Pagamentos e Financiamentos" mistura
  // pagamento com parcelamento de saldo devedor.
  const warnings: string[] = [];
  const paidCents = -lines.filter((l) => l.kind === "payment").reduce((a, l) => a + l.cents, 0);
  if (paidCents !== receivedCents) {
    warnings.push(
      `Pagamentos listados (${formatCents(paidCents)}) diferem do "Pagamento recebido" do resumo (${formatCents(receivedCents)}).`,
    );
  }

  const nextOpen = money(text, NEXT_OPEN_RE);
  const totalOpen = money(text, TOTAL_OPEN_RE);

  return {
    bank: "nubank",
    faturaMonth,
    dueDateISO,
    closingISO,
    totalCents,
    expectedLinesCents,
    limitCents: money(text, LIMIT_RE),
    // Informativo apenas: o "Saldo em aberto" do Nubank inclui compras do ciclo
    // novo que esta fatura não lista, então não serve para validar o cronograma.
    upcoming: nextOpen !== null && totalOpen !== null ? { nextCents: nextOpen, totalCents: totalOpen } : null,
    lines,
    warnings,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/nubank-fatura.test.ts`
Expected: PASS. Se a contagem de linhas divergir de 230, imprima as descrições e compare com a fixture — não ajuste o número esperado sem entender a causa; ele foi medido contra o PDF real.

- [ ] **Step 5: Typecheck, lint e suíte inteira**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/nubank-fatura.ts tests/nubank-fatura.test.ts
git commit -m "feat: parser da fatura fechada do Nubank"
```

---

### Task 3: `lib/fatura-parse.ts` — dispatcher por banco

**Files:**
- Create: `lib/fatura-parse.ts`
- Create: `tests/fatura-parse.test.ts`
- Modify: `lib/bradesco-fatura.ts` (fazer `parseBradescoFatura` devolver `ParsedFatura`)

**Interfaces:**
- Consumes: `parseNubankFatura`, `parseBradescoFatura`, `ParsedFatura`, `FaturaBank`.
- Produces:
  - `detectFaturaBank(text: string): FaturaBank | null`
  - `parseFatura(text: string): ParsedFatura | { error: string }`

- [ ] **Step 1: Escrever o teste que falha**

`tests/fatura-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detectFaturaBank, parseFatura } from "@/lib/fatura-parse";

const nubank = readFileSync("tests/fixtures/nubank-fatura.txt", "utf8");
const bradesco = readFileSync("tests/fixtures/bradesco-fatura.txt", "utf8");

describe("detectFaturaBank", () => {
  it("reconhece o Nubank", () => {
    expect(detectFaturaBank(nubank)).toBe("nubank");
  });

  it("reconhece o Bradesco", () => {
    expect(detectFaturaBank(bradesco)).toBe("bradesco");
  });

  it("devolve null para texto desconhecido", () => {
    expect(detectFaturaBank("boleto de água\nvencimento amanhã")).toBeNull();
  });
});

describe("parseFatura", () => {
  it("despacha a fatura do Nubank", () => {
    const f = parseFatura(nubank);
    expect(f).not.toHaveProperty("error");
    if ("error" in f) return;
    expect(f.bank).toBe("nubank");
    expect(f.totalCents).toBe(1788429);
    expect(f.expectedLinesCents).toBe(1833954);
  });

  it("despacha a fatura do Bradesco e mantém expectedLinesCents = totalCents", () => {
    const f = parseFatura(bradesco);
    expect(f).not.toHaveProperty("error");
    if ("error" in f) return;
    expect(f.bank).toBe("bradesco");
    expect(f.expectedLinesCents).toBe(f.totalCents);
  });

  it("erra com mensagem útil quando não reconhece o banco", () => {
    const f = parseFatura("documento qualquer");
    expect(f).toHaveProperty("error");
    if (!("error" in f)) return;
    expect(f.error).toMatch(/Nubank|Bradesco/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/fatura-parse.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/fatura-parse"`.

- [ ] **Step 3: Fazer o Bradesco devolver `ParsedFatura`**

Em `lib/bradesco-fatura.ts`, troque o tipo de retorno de `parseBradescoFatura` para `ParsedFatura | { error: string }` e o `return` final para incluir os campos novos. O `summary` interno continua sendo usado para as checagens e para os `warnings`, mas sai do tipo público:

```ts
  return {
    bank: "bradesco",
    faturaMonth,
    dueDateISO,
    closingISO,
    totalCents,
    // No Bradesco a soma das linhas é o próprio total da fatura.
    expectedLinesCents: summary.totalCents,
    limitCents: money(text, LIMIT_RE),
    upcoming: upcoming ? { nextCents: upcoming.nextCents, totalCents: upcoming.totalCents } : null,
    lines,
    warnings,
  };
```

Apague o `export type BradescoFatura`.

**Mova `scheduleWarnings` para `lib/fatura-parse.ts`** (Step 4). Ela deixou de ser
específica do Bradesco — passa a decidir pelo `bank` — e manter uma função
genérica num módulo com nome de banco obrigaria o bot a importar
`@/lib/bradesco-fatura` para tratar fatura do Nubank. Ela só precisa de
`buildInstallmentSchedule` (de `fatura-core`) e `formatCents`, então não cria
ciclo. Apague-a de `bradesco-fatura.ts` junto com a constante
`SCHEDULE_TOLERANCE_CENTS`, que vai com ela.

- [ ] **Step 4: Criar `lib/fatura-parse.ts`**

```ts
/**
 * Despacho da importação de fatura: fareja o banco no texto extraído do PDF e
 * chama o parser certo. Os consumidores (bot do Telegram e tela de Cartões)
 * falam só com este módulo.
 */
import { parseBradescoFatura } from "@/lib/bradesco-fatura";
import { parseNubankFatura } from "@/lib/nubank-fatura";
import { buildInstallmentSchedule, type FaturaBank, type ParsedFatura } from "@/lib/fatura-core";
import { formatCents } from "@/lib/money";

/** Tolerância p/ arredondamento de centavos do banco nas parcelas futuras. */
const SCHEDULE_TOLERANCE_CENTS = 500;

/**
 * Âncoras exclusivas de cada emissor. O Nubank é testado primeiro porque a
 * fatura dele MENCIONA o Bradesco em descrições de compra
 * ("Bradesco Aut*03de04"), enquanto o contrário não acontece.
 */
export function detectFaturaBank(text: string): FaturaBank | null {
  if (/^Total a pagar R\$ [\d.,]+$/m.test(text) && /Nu Pagamentos|nubank/i.test(text)) return "nubank";
  if (/Total da fatura\s*R\$/.test(text) && /Bradesc/i.test(text)) return "bradesco";
  return null;
}

export function parseFatura(text: string): ParsedFatura | { error: string } {
  const bank = detectFaturaBank(text);
  if (bank === "nubank") return parseNubankFatura(text);
  if (bank === "bradesco") return parseBradescoFatura(text);
  return { error: "Não reconheci esta fatura. Hoje entendo os PDFs do Nubank e do Bradesco." };
}

/**
 * Divergência entre o cronograma projetado e o que o banco projeta.
 *
 * SÓ o Bradesco tem um número comparável: o "Total parcelado para as próximas
 * faturas" é exclusivamente parcelamento. O "Saldo em aberto" do Nubank inclui
 * compras do ciclo NOVO que a fatura fechada não lista (medido: projeção de
 * set/2026 R$ 6.716,86 + R$ 941,28 do ciclo novo ≈ R$ 7.657,56 do PDF), então
 * comparar geraria aviso falso todo mês.
 */
export function scheduleWarnings(fatura: ParsedFatura): string[] {
  if (fatura.bank !== "bradesco" || !fatura.upcoming) return [];
  const schedule = buildInstallmentSchedule(fatura.lines, fatura.faturaMonth, fatura.bank);
  const months = [...schedule.keys()].sort();
  const next = (schedule.get(months[0]) ?? []).reduce((a, r) => a + r.cents, 0);
  const total = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
  const out: string[] = [];
  const nextDiff = next - fatura.upcoming.nextCents;
  const totalDiff = total - fatura.upcoming.totalCents;
  if (nextDiff !== 0) {
    out.push(
      `Próxima fatura projetada ${formatCents(next)} difere ${formatCents(nextDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (totalDiff !== 0) {
    out.push(
      `Total futuro projetado ${formatCents(total)} difere ${formatCents(totalDiff)} do PDF (ajuste de centavos do banco).`,
    );
  }
  if (Math.abs(nextDiff) > SCHEDULE_TOLERANCE_CENTS || Math.abs(totalDiff) > SCHEDULE_TOLERANCE_CENTS) {
    out.push("Divergência acima de R$ 5,00 — confira as linhas antes de importar.");
  }
  return out;
}
```

**Atenção ao mover:** o `scheduleWarnings` original usava `shiftMonthISO(faturaMonth, 1)`
para achar o mês seguinte. A versão acima usa o primeiro mês do cronograma
(`months[0]`), que é equivalente e não precisa do helper de datas. Se
`tests/bradesco-fatura.test.ts` cobrir `scheduleWarnings`, mova essas asserções
para `tests/fatura-parse.test.ts` **sem alterar os valores**.

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run tests/fatura-parse.test.ts tests/bradesco-fatura.test.ts tests/nubank-fatura.test.ts`
Expected: PASS. Se `tests/bradesco-fatura.test.ts` referenciava `BradescoFatura` ou `fatura.summary`, ajuste o teste para o tipo novo — **sem mudar os valores esperados**.

- [ ] **Step 6: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add lib/fatura-parse.ts lib/bradesco-fatura.ts tests/fatura-parse.test.ts tests/bradesco-fatura.test.ts
git commit -m "feat: dispatcher de fatura por banco"
```

---

### Task 4: `lib/fatura-import.ts` — renome e generalização do aplicador

**Files:**
- Rename: `lib/bradesco-import.ts` → `lib/fatura-import.ts`
- Modify: `app/(app)/cartoes/actions.ts` (import)

**Interfaces:**
- Produces: `applyFaturaImport(opts: { card: CardRef; bank: FaturaBank; faturaMonth: string; closingISO: string; limitCents?: number | null; lines: FaturaLine[] }): Promise<{ months: { month: string; totalCents: number }[] }>`

- [ ] **Step 1: Renomear o arquivo preservando histórico**

```bash
git mv lib/bradesco-import.ts lib/fatura-import.ts
```

- [ ] **Step 2: Renomear a função e passar o banco**

Em `lib/fatura-import.ts`: renomeie `applyBradescoFaturaImport` para `applyFaturaImport`, acrescente `bank` nas opções e repasse ao cronograma.

```ts
export async function applyFaturaImport(opts: {
  card: CardRef;
  bank: FaturaBank;
  faturaMonth: string;
  closingISO: string;
  /** Limite de compras da fatura: quando presente, atualiza o cartão. */
  limitCents?: number | null;
  lines: FaturaLine[];
}): Promise<{ months: { month: string; totalCents: number }[] }> {
  const { card, bank, faturaMonth, closingISO, lines } = opts;
```

e, mais abaixo:

```ts
  const schedule = buildInstallmentSchedule(lines, faturaMonth, bank);
```

Atualize o comentário do topo do arquivo: trocar "Aplica a fatura importada" por uma frase que não cite só o Bradesco, e citar `lib/fatura-parse.ts` como a origem das linhas.

- [ ] **Step 3: Atualizar o import em `cartoes/actions.ts`**

```ts
import { applyFaturaImport } from "@/lib/fatura-import";
```

e a chamada dentro de `applyBradescoFatura` (o renome da action é a Task 5). Nesta
task a action ainda parseia só o Bradesco, então o banco é literal — a Task 5
troca por `bank` vindo do payload:

```ts
  const { months } = await applyFaturaImport({
    card,
    bank: "bradesco",
    faturaMonth,
    closingISO,
    limitCents,
    lines,
  });
```

Isso mantém o repo verde entre as duas tasks.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem saída.

- [ ] **Step 5: Suíte e lint**

Run: `npm test && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/fatura-import.ts "app/(app)/cartoes/actions.ts"
git commit -m "refactor: applyFaturaImport agnóstico de banco"
```

---

### Task 5: Web — `previewFatura` / `applyFatura`

A pegadinha desta task: a revalidação no servidor compara com `totalCents`. Isso só coincide no Bradesco — deixar como está faria **toda** importação do Nubank ser recusada, com a mensagem enganosa "a soma das linhas não bate".

**Files:**
- Modify: `app/(app)/cartoes/actions.ts:190-273`
- Modify: `app/(app)/cartoes/ImportFaturaDialog.tsx`

**Interfaces:**
- Consumes: `parseFatura` de `@/lib/fatura-parse`; `applyFaturaImport` de `@/lib/fatura-import`; `sumFaturaLines` de `@/lib/fatura-core`.
- Produces: server actions `previewFatura` e `applyFatura`; o preview passa a carregar `bank` e `expectedLinesCents`.

- [ ] **Step 1: Estender o schema do payload**

Em `app/(app)/cartoes/actions.ts`, no `applyPayloadSchema`, acrescente:

```ts
  bank: z.enum(["nubank", "bradesco"]),
  expectedLinesCents: z.number().int(),
```

- [ ] **Step 2: Trocar o parser e renomear a action de preview**

No bloco de imports do arquivo, `parseBradescoFatura` e `scheduleWarnings` saem de
`@/lib/bradesco-fatura` e passam a vir de `@/lib/fatura-parse`; `sumFaturaLines`
vem de `@/lib/fatura-core`:

```ts
import { parseFatura, scheduleWarnings } from "@/lib/fatura-parse";
import { sumFaturaLines } from "@/lib/fatura-core";
```

```ts
/** Lê o PDF da fatura (Nubank ou Bradesco) e devolve o preview validado — nada é gravado. */
export const previewFatura = guardAction(async function previewFatura(
```

Dentro dela, troque `parseBradescoFatura(text)` por `parseFatura(text)` e acrescente os campos novos ao `preview`:

```ts
  const fatura = parseFatura(text);
  if ("error" in fatura) return { error: fatura.error };
  return {
    preview: {
      cardId,
      bank: fatura.bank,
      faturaMonth: fatura.faturaMonth,
      dueDateISO: fatura.dueDateISO,
      closingISO: fatura.closingISO,
      totalCents: fatura.totalCents,
      expectedLinesCents: fatura.expectedLinesCents,
      limitCents: fatura.limitCents,
      warnings: [...fatura.warnings, ...scheduleWarnings(fatura)],
      lines: fatura.lines,
    },
  };
```

Atualize o tipo `FaturaPreviewState` para incluir `bank` e `expectedLinesCents`.

- [ ] **Step 3: Corrigir a revalidação e renomear a action de apply**

```ts
/** Aplica o preview confirmado (descrições possivelmente editadas). */
export const applyFatura = guardAction(async function applyFatura(
```

e dentro:

```ts
  const { cardId, bank, faturaMonth, closingISO, expectedLinesCents, limitCents, lines } = parsed.data;

  // Revalida a soma no servidor: edição só de descrição não muda o total.
  // Compara com expectedLinesCents, NÃO com totalCents — os dois só coincidem
  // no Bradesco; no Nubank a antecipação do ciclo entra na diferença.
  if (sumFaturaLines(lines) !== expectedLinesCents) {
    return { error: "A soma das linhas não bate com o total da fatura — refaça o preview." };
  }
```

e a chamada:

```ts
  const { months } = await applyFaturaImport({ card, bank, faturaMonth, closingISO, limitCents, lines });
```

- [ ] **Step 4: Atualizar o diálogo**

Em `app/(app)/cartoes/ImportFaturaDialog.tsx`: troque os imports/`useActionState` de `previewBradescoFatura`/`applyBradescoFatura` para `previewFatura`/`applyFatura`, e inclua `bank` e `expectedLinesCents` no objeto serializado em `payload`. Ajuste o texto visível que disser "Bradesco" para algo neutro ("fatura em PDF").

- [ ] **Step 5: Typecheck e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erro. Erro de `bank` ausente em algum lugar significa payload incompleto no diálogo.

- [ ] **Step 6: Rodar a suíte**

Run: `npm test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/cartoes/actions.ts" "app/(app)/cartoes/ImportFaturaDialog.tsx"
git commit -m "feat: importação de fatura na web aceita Nubank e Bradesco"
```

---

### Task 6: Bot — importar a fatura em PDF

**Files:**
- Modify: `app/api/telegram/route.ts` (novo handler, dispatch em `POST`, `HELP`)

**Interfaces:**
- Consumes: `downloadTelegramFileBinary` (já existe no arquivo, linha ~85), `findCardByHint` (~77), `reply` (~61), `parseFatura`, `applyFaturaImport`, `scheduleWarnings`, `revalidateFinance`, `formatCents`, `fmtMonth`.

- [ ] **Step 1: Escrever o handler**

Em `app/api/telegram/route.ts`, depois de `handleCsvDocument`, acrescente:

```ts
const MAX_FATURA_PDF_BYTES = 4_000_000;

/**
 * Fatura FECHADA em PDF (Nubank ou Bradesco): valida contra o total do próprio
 * documento e, se fechar, grava o mês e reconstrói as parcelas futuras. Falha
 * fechada — divergência de transcrição não grava nada.
 */
async function handleFaturaPdfDocument(
  chatId: number,
  doc: NonNullable<TelegramUpdate["message"]>["document"] & { file_id: string },
  caption: string | undefined,
) {
  if ((doc.file_size ?? 0) > MAX_FATURA_PDF_BYTES) {
    await reply(chatId, "PDF acima de 4 MB — mande a fatura direto do app do banco.");
    return;
  }
  const buffer = await downloadTelegramFileBinary(doc.file_id);
  if (!buffer) {
    await reply(chatId, "Não consegui baixar o arquivo. Tente enviar de novo.");
    return;
  }

  // Import dinâmico: o worker do pdfjs só carrega quando alguém manda fatura.
  let text: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    await reply(chatId, "Não consegui ler o PDF (arquivo corrompido ou protegido).");
    return;
  }

  const fatura = parseFatura(text);
  if ("error" in fatura) {
    await reply(chatId, `❌ ${fatura.error}`);
    return;
  }

  // Cartão: a legenda ganha; sem ela, o banco que o parser identificou.
  const hint = caption?.trim().toLowerCase() || fatura.bank;
  const card = await findCardByHint(hint);
  if (!card) {
    await reply(chatId, CARD_NOT_FOUND(hint));
    return;
  }

  const { months } = await applyFaturaImport({
    card,
    bank: fatura.bank,
    faturaMonth: fatura.faturaMonth,
    closingISO: fatura.closingISO,
    limitCents: fatura.limitCents,
    lines: fatura.lines,
  });
  revalidateFinance();

  const applied = months.find((m) => m.month === fatura.faturaMonth);
  const parts = [
    `✅ Fatura ${card.name} — ${fmtMonth(fatura.faturaMonth)}`,
    `Total: ${formatCents(fatura.totalCents)}`,
    `${fatura.lines.filter((l) => l.kind !== "payment").length} lançamentos`,
    "",
    "Meses atualizados:",
    ...months
      .filter((m) => m.totalCents !== 0)
      .map((m) => `• ${fmtMonth(m.month)} — ${formatCents(m.totalCents)}`),
  ];

  // A fatura foi lida certa; se o mês fechou em outro valor, falta um dado no
  // app — tipicamente a antecipação que o banco já abateu.
  if (applied && applied.totalCents !== fatura.totalCents) {
    const diff = applied.totalCents - fatura.totalCents;
    parts.push(
      "",
      `⚠️ O mês fechou em ${formatCents(applied.totalCents)}, ${formatCents(Math.abs(diff))} ${diff > 0 ? "acima" : "abaixo"} do total da fatura.`,
      'Se você antecipou pagamento neste ciclo, registre com "antecipei <valor> ' + card.name.toLowerCase() + '".',
    );
  }
  for (const w of [...fatura.warnings, ...scheduleWarnings(fatura)]) parts.push(`⚠️ ${w}`);

  await reply(chatId, parts.join("\n"));
}
```

Acrescente aos imports do arquivo:

```ts
import { parseFatura, scheduleWarnings } from "@/lib/fatura-parse";
import { applyFaturaImport } from "@/lib/fatura-import";
```

- [ ] **Step 2: Ligar o dispatch**

Em `POST`, troque o bloco de documento (hoje duas vias) por três:

```ts
  if (doc?.file_id) {
    const name = doc.file_name ?? "";
    if (/\.xlsx$/i.test(name)) {
      await handleB3Document(chatId, { ...doc, file_id: doc.file_id });
    } else if (/\.pdf$/i.test(name)) {
      await handleFaturaPdfDocument(chatId, { ...doc, file_id: doc.file_id }, update.message?.caption);
    } else {
      await handleCsvDocument(chatId, { ...doc, file_id: doc.file_id }, update.message?.caption);
    }
    return NextResponse.json({ ok: true });
  }
```

- [ ] **Step 3: Atualizar o `HELP`**

A linha atual diz que PDF só importa pelo app. Troque:

```ts
  "• Fatura fechada: envie o PDF do Nubank ou do Bradesco — eu confiro o total e travo o mês\n" +
  "• Fatura em aberto: envie o .csv do banco\n" +
```

- [ ] **Step 4: Conferir o teste do HELP**

Run: `npx vitest run tests/telegram-help.test.ts`
Expected: PASS. Se ele afirmar algo sobre o texto antigo, atualize a asserção para a frase nova.

- [ ] **Step 5: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add app/api/telegram/route.ts tests/telegram-help.test.ts
git commit -m "feat: bot importa fatura fechada em PDF"
```

---

### Task 7: Guard do CSV — um CSV é de uma fatura só

Hoje `handleCsvDocument` roteia cada linha pela data e chama `replaceCardMonth` por mês. O corte da fatura do Nubank é intradiário, então o CSV da fatura aberta traz linhas datadas antes do fechamento que caem no mês já fechado — e o replace **apaga a fatura fechada** (medido: 229 linhas viram 5).

**Files:**
- Modify: `app/api/telegram/route.ts` (`handleCsvDocument`, ~linha 257-283)
- Create: `lib/csv-fatura-target.ts`
- Create: `tests/csv-fatura-guard.test.ts`

**Interfaces:**
- Produces: `pickFaturaMonth(rowsByMonth: Map<string, unknown[]>): string | null` — o mês majoritário; empate vence o mais recente.

- [ ] **Step 1: Escrever o teste que falha**

`tests/csv-fatura-guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickFaturaMonth } from "@/lib/csv-fatura-target";

describe("pickFaturaMonth", () => {
  it("elege o mês com mais linhas", () => {
    const m = new Map<string, unknown[]>([
      ["2026-08", [1, 2, 3, 4, 5]],
      ["2026-09", new Array(63).fill(0)],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-09");
  });

  it("no empate, vence o mês mais recente", () => {
    const m = new Map<string, unknown[]>([
      ["2026-08", [1, 2]],
      ["2026-09", [1, 2]],
    ]);
    expect(pickFaturaMonth(m)).toBe("2026-09");
  });

  it("mapa vazio devolve null", () => {
    expect(pickFaturaMonth(new Map())).toBeNull();
  });

  it("um mês só é ele mesmo", () => {
    expect(pickFaturaMonth(new Map([["2026-09", [1]]]))).toBe("2026-09");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/csv-fatura-guard.test.ts`
Expected: FAIL — módulo não resolve.

- [ ] **Step 3: Criar `lib/csv-fatura-target.ts`**

```ts
/**
 * Um CSV exportado do banco é sempre de UMA fatura. Quando o roteamento por
 * data espalha as linhas em vários meses, só o mês majoritário pode ser
 * SUBSTITUÍDO — os outros recebem inserção aditiva.
 *
 * Sem isso, o corte intradiário da fatura do Nubank (emitida às 03:31 do dia do
 * fechamento) manda umas poucas linhas para o mês já fechado, e o replace apaga
 * a fatura fechada inteira.
 */
export function pickFaturaMonth<T>(rowsByMonth: Map<string, T[]>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [month, rows] of rowsByMonth) {
    // Empate vence o mês mais recente: a fatura em aberto é a que está sendo
    // exportada.
    if (rows.length > bestCount || (rows.length === bestCount && best !== null && month > best)) {
      best = month;
      bestCount = rows.length;
    }
  }
  return best;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/csv-fatura-guard.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Aplicar o guard em `handleCsvDocument`**

Troque o laço que faz `replaceCardMonth` em todos os meses por:

```ts
  const months = [...rowsByMonth.keys()].sort();
  const target = pickFaturaMonth(rowsByMonth)!;
  const totalsByMonth = new Map<string, number>();
  const addedByMonth = new Map<string, number>();

  for (const month of months) {
    const rows = rowsByMonth.get(month)!;
    if (month === target) {
      const { totalCents } = await replaceCardMonth(card, month, rows);
      totalsByMonth.set(month, totalCents);
      continue;
    }
    // Fora do mês da fatura: INSERE o que falta, nunca apaga. Estas linhas são
    // resíduo do corte intradiário do banco; o mês pode ser uma fatura fechada.
    let added = 0;
    for (const row of rows) {
      const purchaseDate = row.dateISO ? new Date(row.dateISO + "T00:00:00Z") : null;
      const existing = await prisma.cardTransaction.findFirst({
        where: {
          cardId: card.id,
          month: monthToDate(month),
          description: row.description,
          purchaseDate,
          amount: centsToNumber(row.amountCents),
        },
      });
      if (existing) continue;
      await prisma.cardTransaction.create({
        data: {
          cardId: card.id,
          month: monthToDate(month),
          description: row.description,
          amount: centsToNumber(row.amountCents),
          purchaseDate,
        },
      });
      added++;
    }
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(month) },
      _sum: { amount: true },
    });
    const totalCents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({ card, month, amountCents: totalCents, mode: "set" });
    totalsByMonth.set(month, totalCents);
    addedByMonth.set(month, added);
  }
```

Acrescente ao resumo da resposta, depois da lista de meses:

```ts
  for (const [month, added] of addedByMonth) {
    msg += `\nℹ️ ${fmtMonth(month)}: ${added} lançamento(s) acrescentado(s) sem mexer no resto (fatura de outro ciclo).`;
  }
```

Garanta os imports usados: `pickFaturaMonth`, `monthToDate`, `centsToNumber`, `decimalToCents`, `upsertCardEntry`, `prisma` (a maioria já está no arquivo).

- [ ] **Step 6: Suíte, typecheck e lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add lib/csv-fatura-target.ts tests/csv-fatura-guard.test.ts app/api/telegram/route.ts
git commit -m "fix: CSV de fatura não apaga mais o extrato de outro ciclo"
```

---

### Task 8: Documentação, versão e changelog

**Files:**
- Modify: `docs/fatura-nubank.md`
- Modify: `package.json`
- Modify: `lib/changelog.ts`
- Modify: `docs/log.md`

- [ ] **Step 1: Atualizar `docs/fatura-nubank.md`**

Acrescente uma seção "Parser" com: as âncoras da tabela do spec; o invariante de duas rotas com os números da fatura-modelo; o sinal U+2212; os dois casos de valor deslocado; e a regra de agrupamento por plano na projeção. Troque a instrução de importação — hoje o doc manda usar a tela de Cartões — por "envie o PDF no Telegram ou use a tela de Cartões; as duas passam por `lib/fatura-parse.ts`".

- [ ] **Step 2: Bump de versão**

Em `package.json`: `"version": "1.3.0"`.

- [ ] **Step 3: Entrada no changelog**

No topo de `CHANGELOG` em `lib/changelog.ts`:

```ts
  {
    version: "1.3.0",
    date: "2026-08-05",
    title: "Fatura fechada pelo Telegram",
    items: [
      "Mande o PDF da fatura do Nubank ou do Bradesco no Telegram: o bot confere o total com o banco e trava o mês, já reconstruindo as parcelas dos meses seguintes.",
      "Se a conta não fechar, nada é gravado — o bot diz exatamente qual valor divergiu.",
      "A tela de Cartões também passou a aceitar a fatura do Nubank em PDF.",
      "Corrigido: importar o CSV de uma fatura não apaga mais os lançamentos de uma fatura já fechada.",
    ],
  },
```

- [ ] **Step 4: Linha no log de conhecimento**

Em `docs/log.md`, acrescente:

```
2026-08-05 — added parser da fatura Nubank e importação de fatura em PDF pelo Telegram; cronograma de parcelas passa a agrupar por plano
```

- [ ] **Step 5: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: verde. `tests/changelog.test.ts` valida que a entrada do topo é igual à `version` do `package.json`.

- [ ] **Step 6: Commit**

```bash
git add docs/fatura-nubank.md docs/log.md package.json lib/changelog.ts
git commit -m "chore: versão 1.3.0 e changelog"
```

---

## Verificação final

- [ ] `npm test` — 384 testes da baseline + os novos, todos passando
- [ ] `npx tsc --noEmit` — sem saída
- [ ] `npm run lint` — só os 4 warnings pré-existentes
- [ ] `grep -rn "applyBradescoFaturaImport\|previewBradescoFatura\|applyBradescoFatura\|BradescoFatura" lib app` — sem resultado (renomes completos)
- [ ] `git status` — nenhum PDF ou CSV de fatura no working tree

## Teste manual (opcional, requer o PDF real)

O PDF da fatura não está no repo. Para validar ponta a ponta, mande o PDF no chat do bot e confira que a resposta traz `Total: R$ 17.884,29` e que ago/2026 fecha nesse valor. Reenviar o mesmo arquivo tem que dar o mesmo resultado (idempotência do `replaceCardMonth`).
