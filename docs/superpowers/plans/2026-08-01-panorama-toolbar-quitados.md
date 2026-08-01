# Barra do controle de meses quitados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o link de texto do Panorama por uma barra (resumo do que está oculto + botão com ícone) dentro do card, acima da tabela.

**Architecture:** Helper puro `hiddenMonthsSummary` em `lib/matrix.ts` (testado) monta o texto do resumo; a página renderiza a faixa com `Button asChild` + `Link`, mantendo o toggle por URL. Spec: `docs/superpowers/specs/2026-08-01-panorama-toolbar-quitados-design.md`.

**Tech Stack:** Next.js (App Router, server components), shadcn/ui (`Button`), lucide-react (`Eye`, `EyeOff`), Vitest.

## Global Constraints

- **Textos exatos (pt-BR):** resumo `Ocultando {N} {mês quitado|meses quitados}: {lista}`; até 3 meses listados, resto vira ` +{N}`; estado exibindo → `Exibindo todos os meses`; botões → `Mostrar quitados` / `Ocultar quitados`; `aria-label` → `Mostrar meses quitados` / `Ocultar meses quitados`.
- Rótulo de mês sempre via `shortMonthLabel` (`"2026-07"` → `"jul/26"`).
- A faixa só renderiza quando `hidden.length > 0`; o toggle continua por URL (`/panorama?quitados=1` ↔ `/panorama`), sem estado de cliente.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Helper `hiddenMonthsSummary`

**Files:**
- Modify: `lib/matrix.ts` (logo após `shortMonthLabel`, no fim do arquivo)
- Test: `tests/matrix.test.ts` (novo `describe` ao final)

**Interfaces:**
- Consumes: `shortMonthLabel(monthISO: string): string` (já existe no mesmo arquivo).
- Produces (Task 2 consome): `hiddenMonthsSummary(hidden: string[]): string`.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/matrix.test.ts` (e inclua `hiddenMonthsSummary` no import existente de `@/lib/matrix`):

```ts
describe("hiddenMonthsSummary", () => {
  it("lista vazia devolve string vazia", () => {
    expect(hiddenMonthsSummary([])).toBe("");
  });

  it("um mês usa singular e nomeia o mês", () => {
    expect(hiddenMonthsSummary(["2026-07"])).toBe("Ocultando 1 mês quitado: jul/26");
  });

  it("três meses: plural e lista completa", () => {
    expect(hiddenMonthsSummary(["2026-01", "2026-02", "2026-03"])).toBe(
      "Ocultando 3 meses quitados: jan/26, fev/26, mar/26",
    );
  });

  it("mais de três: corta em três e soma o resto", () => {
    expect(hiddenMonthsSummary(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"])).toBe(
      "Ocultando 5 meses quitados: jan/26, fev/26, mar/26 +2",
    );
  });

  it("virada de ano na formatação dos rótulos", () => {
    expect(hiddenMonthsSummary(["2026-12", "2027-01"])).toBe(
      "Ocultando 2 meses quitados: dez/26, jan/27",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/matrix.test.ts`
Expected: FAIL — `hiddenMonthsSummary` não é exportado.

- [ ] **Step 3: Write minimal implementation**

Em `lib/matrix.ts`, logo após `shortMonthLabel`:

```ts
/** Quantos meses listar por extenso no resumo antes de resumir o resto em "+N". */
const SUMMARY_MONTH_LIMIT = 3;

/** "Ocultando 1 mês quitado: jul/26" — lista até 3 meses, resto vira "+N". */
export function hiddenMonthsSummary(hidden: string[]): string {
  if (hidden.length === 0) return "";
  const labels = hidden.slice(0, SUMMARY_MONTH_LIMIT).map(shortMonthLabel).join(", ");
  const rest = hidden.length - SUMMARY_MONTH_LIMIT;
  const noun = hidden.length === 1 ? "mês quitado" : "meses quitados";
  return `Ocultando ${hidden.length} ${noun}: ${labels}${rest > 0 ? ` +${rest}` : ""}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/matrix.test.ts`
Expected: PASS (todos, inclusive os 5 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/matrix.ts tests/matrix.test.ts
git commit -m "feat: hiddenMonthsSummary — resumo dos meses ocultos"
```

---

### Task 2: Barra no card do Panorama

**Files:**
- Modify: `app/(app)/panorama/page.tsx`

**Interfaces:**
- Consumes: `hiddenMonthsSummary(hidden: string[]): string` (Task 1), via import de `@/lib/matrix`; as variáveis `hidden`, `showSettled` e `visibleMonths` já existem na página.
- Produces: UI final — nada consome depois.

- [ ] **Step 1: Remover o link antigo do cabeçalho**

Em `app/(app)/panorama/page.tsx`, apague este bloco inteiro do cabeçalho da página (fica logo após o `<p>` de ajuda, dentro do `div` do `<h1>`):

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

O `<h1>` e o `<p>` continuam como estão.

- [ ] **Step 2: Imports**

Acrescente `hiddenMonthsSummary` ao import existente de `@/lib/matrix`; e adicione:

```tsx
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 3: Renderizar a faixa**

Dentro do `<CardContent className="px-0">` do ramo não-vazio, ANTES do `<div className="overflow-x-auto">`:

```tsx
            {hidden.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {showSettled ? "Exibindo todos os meses" : hiddenMonthsSummary(hidden)}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={showSettled ? "/panorama" : "/panorama?quitados=1"}
                    aria-label={showSettled ? "Ocultar meses quitados" : "Mostrar meses quitados"}
                  >
                    {showSettled ? <EyeOff /> : <Eye />}
                    {showSettled ? "Ocultar quitados" : "Mostrar quitados"}
                  </Link>
                </Button>
              </div>
            )}
```

O `Button` já dimensiona ícones do lucide via CSS (`[&_svg]`), então não passe classes de tamanho no ícone.

- [ ] **Step 4: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes em outros arquivos).

Confira também que `Link` continua importado e usado (o `monthTh` e a faixa usam) — se o lint acusar import não usado, algo foi removido a mais.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/panorama/page.tsx"
git commit -m "feat: barra com resumo e botão dos meses quitados"
```

---

### Task 3: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7 (nenhum teste toca o Panorama; o gate é regressão geral).

- [ ] **Step 3: verificação visual (dados reais, somente leitura)**

Suba o app compilado numa porta livre com senha de teste e tire screenshots das duas telas:

```bash
APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3197
```

Com Playwright: login em `/login` (campo `input[name="password"]`, botão `Entrar`), depois `/panorama` e `/panorama?quitados=1`, screenshot de cada. Confirme: a faixa aparece dentro do card acima da tabela; o resumo diz `Ocultando 1 mês quitado: jul/26`; o botão `Mostrar quitados` tem contorno e ícone; em `?quitados=1` o texto vira `Exibindo todos os meses` e o botão `Ocultar quitados`. Encerre o servidor ao final e anexe os screenshots ao relatório.
