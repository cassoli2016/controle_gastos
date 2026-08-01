# Panorama oculta meses quitados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meses anteriores ao corrente e totalmente quitados (nada a pagar E nada a receber) somem da matriz do Panorama por padrão, com link "Mostrar N meses quitados" para revê-los.

**Architecture:** Helper puro `settledPastMonths` em `lib/matrix.ts` (testado em `tests/matrix.test.ts`); a página filtra `matrix.months` e alterna pela URL (`/panorama?quitados=1`) — server component sem estado de cliente. Spec: `docs/superpowers/specs/2026-08-01-panorama-ocultar-quitados-design.md`.

**Tech Stack:** Next.js (App Router, server components), Vitest.

## Global Constraints

- **Critério exato de "quitado":** `m < currentMonth && (toPayByMonth[m] ?? 0) === 0 && (toReceiveByMonth[m] ?? 0) === 0`. Mês corrente/futuro nunca some.
- **Rótulos exatos (pt-BR):** oculto → `Mostrar {N} mês quitado`/`Mostrar {N} meses quitados` (singular/plural); exibindo → `Ocultar meses quitados`.
- O estado vazio ("Nenhum lançamento ainda.") continua decidido por `matrix.months` (a lista COMPLETA), nunca pela lista filtrada.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).
- Este repo usa Next.js com breaking changes — para ler `searchParams` numa página, confira o padrão já usado em `app/(app)/mes/page.tsx` (`searchParams: Promise<...>` com `await`).

---

### Task 1: Helper puro `settledPastMonths`

**Files:**
- Modify: `lib/matrix.ts` (após `buildMatrix`, antes de `MONTH_SHORT`)
- Test: `tests/matrix.test.ts` (novo `describe` ao final)

**Interfaces:**
- Consumes: tipo `Matrix` já exportado em `lib/matrix.ts` (`{ months, sections, toReceiveByMonth, toPayByMonth, balanceByMonth }`).
- Produces (Task 2 consome): `settledPastMonths(matrix: Pick<Matrix, "months" | "toPayByMonth" | "toReceiveByMonth">, currentMonth: string): string[]`.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/matrix.test.ts` (import: acrescente `settledPastMonths` ao import existente de `@/lib/matrix`):

```ts
describe("settledPastMonths", () => {
  const base = {
    months: ["2026-06", "2026-07", "2026-08", "2026-09"],
    toPayByMonth: {} as Record<string, number>,
    toReceiveByMonth: {} as Record<string, number>,
  };

  it("mês passado com tudo quitado é listado", () => {
    const m = { ...base, toPayByMonth: { "2026-06": 0 }, toReceiveByMonth: { "2026-06": 0 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-06", "2026-07"]);
  });

  it("mês passado com despesa pendente NÃO é listado", () => {
    const m = { ...base, toPayByMonth: { "2026-06": 5000 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-07"]);
  });

  it("mês passado com receita pendente NÃO é listado", () => {
    const m = { ...base, toReceiveByMonth: { "2026-07": 100 } };
    expect(settledPastMonths(m, "2026-08")).toEqual(["2026-06"]);
  });

  it("mês corrente e futuros nunca são listados, mesmo quitados", () => {
    expect(settledPastMonths(base, "2026-06")).toEqual([]);
  });

  it("mês sem chave nos buckets conta como zerado", () => {
    expect(settledPastMonths(base, "2026-09")).toEqual(["2026-06", "2026-07", "2026-08"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/matrix.test.ts`
Expected: FAIL — `settledPastMonths` não é exportado.

- [ ] **Step 3: Write minimal implementation**

Em `lib/matrix.ts`, após `buildMatrix`:

```ts
/**
 * Meses anteriores a currentMonth com nada a pagar E nada a receber — podem
 * ser ocultados na visão do Panorama (mês com QUALQUER pendência fica).
 */
export function settledPastMonths(
  matrix: Pick<Matrix, "months" | "toPayByMonth" | "toReceiveByMonth">,
  currentMonth: string,
): string[] {
  return matrix.months.filter(
    (m) =>
      m < currentMonth &&
      (matrix.toPayByMonth[m] ?? 0) === 0 &&
      (matrix.toReceiveByMonth[m] ?? 0) === 0,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/matrix.test.ts`
Expected: PASS (todos, inclusive os 5 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/matrix.ts tests/matrix.test.ts
git commit -m "feat: settledPastMonths — meses passados quitados da matriz"
```

---

### Task 2: Filtro e toggle na página do Panorama

**Files:**
- Modify: `app/(app)/panorama/page.tsx`

**Interfaces:**
- Consumes: `settledPastMonths` (Task 1), via import existente de `@/lib/matrix`.
- Produces: UI final — nada consome depois.

- [ ] **Step 1: Ler searchParams e filtrar meses**

1. Acrescente `settledPastMonths` ao import de `@/lib/matrix`.
2. Assinatura da página (padrão do `mes/page.tsx`):

```tsx
export default async function PanoramaPage({ searchParams }: { searchParams: Promise<{ quitados?: string }> }) {
  const { quitados } = await searchParams;
  const showSettled = quitados === "1";
```

3. Depois de `const matrix = buildMatrix(entries);` acrescente:

```tsx
  const hidden = settledPastMonths(matrix, currentMonth);
  const visibleMonths = showSettled ? matrix.months : matrix.months.filter((m) => !hidden.includes(m));
```

Atenção: `currentMonth` é declarado ANTES de `buildMatrix` no arquivo — a ordem atual já serve.

4. Troque **todas** as iterações da tabela de `matrix.months` para `visibleMonths` (4 pontos):
   - `<thead>`: `{matrix.months.map(monthTh)}` → `{visibleMonths.map(monthTh)}`
   - `<SectionRows … months={matrix.months} …>` → `months={visibleMonths}`
   - Linha "A receber": `{matrix.months.map((m) => (…toReceiveByMonth…))}` → `visibleMonths.map`
   - Linha "A pagar" e linha "Saldo a realizar": idem, `visibleMonths.map`

   O guard do estado vazio (`matrix.months.length === 0 ?`) **fica como está**.

- [ ] **Step 2: Link de alternância**

No bloco do cabeçalho da página (o `div` com o `<h1>Panorama</h1>` e o `<p>` de descrição), acrescente logo após o `<p>`:

```tsx
        {hidden.length > 0 && (
          <Link
            href={showSettled ? "/panorama" : "/panorama?quitados=1"}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {showSettled
              ? "Ocultar meses quitados"
              : `Mostrar ${hidden.length} ${hidden.length === 1 ? "mês quitado" : "meses quitados"}`}
          </Link>
        )}
```

(`Link` já é importado no arquivo.)

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/panorama/page.tsx"
git commit -m "feat: Panorama oculta meses passados quitados com toggle"
```

---

### Task 3: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7 verdes (o teste do Panorama, se houver célula assertada, roda no mês 2030-01 — futuro, nunca oculto; sem regressão esperada).

- [ ] **Step 3: verificação visual**

No servidor e2e ou dev: marcar todas as pendências de um mês passado e conferir que a coluna some do Panorama, o link "Mostrar 1 mês quitado" aparece, e `?quitados=1` a traz de volta. Alternativa mais simples (sem mexer em dados): conferir visualmente que meses passados quitados reais sumiram e o link mostra a contagem certa — screenshot para o relatório.
