# Seletor de mês e ano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar no rótulo do mês abre um popover com ano e grade de meses, funcionando igual em qualquer navegador (hoje o campo nativo invisível não abre no desktop).

**Architecture:** As três funções com regra saem do componente para `lib/month-nav.ts` e ganham teste; `components/MonthNav.tsx` troca o `<input type="month">` por um `Popover` com linha de ano, grade 4×3 de meses e botão "Mês atual". Nenhuma tela que usa o componente muda. Spec: `docs/superpowers/specs/2026-08-02-seletor-mes-design.md`.

**Tech Stack:** Next.js (client component), shadcn/ui `Popover` + `Button`, Vitest.

## Global Constraints

- Rótulos em pt-BR: grade com `jan`…`dez` (minúsculo, 3 letras); rótulo do gatilho `"Agosto 2026"` (capitalizado).
- A linha de ano muda **só o ano exibido** no popover (estado local) — não navega.
- Clicar num mês navega para `${basePath}?month=YYYY-MM` e fecha o popover.
- Mês da tela: `variant="default"` + `aria-current="true"`. Mês de hoje: `ring-1 ring-primary/40`.
- Botão **Mês atual** no rodapé navega para `todayISOInSaoPaulo().slice(0, 7)`.
- Gatilho com `aria-label="Escolher mês e ano"`; o `<input type="month">` sai.
- As setas ‹ › continuam funcionando como hoje.
- **Commits:** mensagem pt-BR estilo conventional; `git add` só dos arquivos da task (nunca `git add -A`).

---

### Task 1: Helpers `lib/month-nav.ts`

**Files:**
- Create: `lib/month-nav.ts`
- Test: `tests/month-nav.test.ts`

**Interfaces:**
- Consumes: `monthToDate`, `monthStringFromDate` de `@/lib/dates`.
- Produces (Task 2 consome): `shiftMonth(month: string, delta: number): string`; `monthLabel(month: string): string`; `monthGrid(year: number): { monthISO: string; short: string }[]`.

- [ ] **Step 1: Write the failing test**

Crie `tests/month-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shiftMonth, monthLabel, monthGrid } from "@/lib/month-nav";

describe("shiftMonth", () => {
  it("avança e volta dentro do ano", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  });

  it("dezembro + 1 vira janeiro do ano seguinte", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("janeiro − 1 volta para dezembro do ano anterior", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("salto maior que um ano", () => {
    expect(shiftMonth("2026-08", 14)).toBe("2027-10");
  });
});

describe("monthLabel", () => {
  it("formata capitalizado em pt-BR", () => {
    expect(monthLabel("2026-08")).toBe("Agosto 2026");
  });

  it("mês com acento", () => {
    expect(monthLabel("2026-03")).toBe("Março 2026");
  });
});

describe("monthGrid", () => {
  const grade = monthGrid(2026);

  it("tem os 12 meses do ano", () => {
    expect(grade).toHaveLength(12);
    expect(grade[0]).toEqual({ monthISO: "2026-01", short: "jan" });
    expect(grade[11]).toEqual({ monthISO: "2026-12", short: "dez" });
  });

  it("rótulos minúsculos de três letras", () => {
    expect(grade.map((g) => g.short)).toEqual([
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/month-nav.test.ts`
Expected: FAIL — `Cannot find module '@/lib/month-nav'`.

- [ ] **Step 3: Write minimal implementation**

Crie `lib/month-nav.ts`:

```ts
import { monthToDate, monthStringFromDate } from "@/lib/dates";

/** "2026-08" + delta em meses → "2026-09" (delta negativo volta). */
export function shiftMonth(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** "2026-08" → "Agosto 2026" (pt-BR, capitalizado). */
export function monthLabel(month: string): string {
  const d = monthToDate(month);
  const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(d);
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} ${d.getUTCFullYear()}`;
}

/** Os 12 meses do ano, para a grade do seletor. */
export function monthGrid(year: number): { monthISO: string; short: string }[] {
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => {
    const monthISO = `${year}-${String(i + 1).padStart(2, "0")}`;
    // Intl devolve "ago." em algumas versões: tira o ponto e deixa minúsculo.
    const short = fmt.format(monthToDate(monthISO)).replace(".", "").toLowerCase();
    return { monthISO, short };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/month-nav.test.ts`
Expected: PASS (8 testes). Se os rótulos vierem com ponto (`"ago."`) mesmo assim, o `.replace(".", "")` já cobre; se vierem com outra grafia, **pare e relate** em vez de mudar o teste.

- [ ] **Step 5: Commit**

```bash
git add lib/month-nav.ts tests/month-nav.test.ts
git commit -m "feat: helpers do seletor de mês"
```

---

### Task 2: Popover no `MonthNav`

**Files:**
- Modify: `components/MonthNav.tsx` (reescrita do componente)

**Interfaces:**
- Consumes: `shiftMonth`, `monthLabel`, `monthGrid` (Task 1); `Popover`, `PopoverContent`, `PopoverTrigger` de `@/components/ui/popover`; `Button`; `todayISOInSaoPaulo` de `@/lib/fatura`.
- Produces: UI final. A assinatura pública `MonthNav({ month, basePath })` **não muda** — Mês, Dashboard e Cartões seguem intactos.

- [ ] **Step 1: Reescrever o componente**

Substitua todo o conteúdo de `components/MonthNav.tsx` por:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth, monthLabel, monthGrid } from "@/lib/month-nav";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const currentMonth = todayISOInSaoPaulo().slice(0, 7);

  const [open, setOpen] = useState(false);
  // Ano exibido na grade: começa no ano do mês da tela e muda só aqui dentro.
  const [year, setYear] = useState(Number(month.slice(0, 4)));

  function irPara(alvo: string) {
    setOpen(false);
    router.push(`${basePath}?month=${alvo}`);
  }

  return (
    <div className="flex items-center rounded-lg border bg-card shadow-xs">
      <Button asChild variant="ghost" size="icon-sm" className="rounded-r-none" aria-label="Mês anterior">
        <Link href={`${basePath}?month=${prev}`}>
          <ChevronLeft className="size-4" />
        </Link>
      </Button>

      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          // Reabrir sempre mostra o ano do mês em que a tela está.
          if (v) setYear(Number(month.slice(0, 4)));
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Escolher mês e ano"
            className="min-w-32 border-x px-3 py-1.5 text-center text-sm font-medium tabular-nums hover:bg-muted"
          >
            {monthLabel(month)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="mb-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Ano anterior" onClick={() => setYear((y) => y - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{year}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Próximo ano" onClick={() => setYear((y) => y + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {monthGrid(year).map((m) => {
              const selecionado = m.monthISO === month;
              return (
                <Button
                  key={m.monthISO}
                  type="button"
                  size="sm"
                  variant={selecionado ? "default" : "ghost"}
                  aria-current={selecionado ? "true" : undefined}
                  className={m.monthISO === currentMonth && !selecionado ? "ring-1 ring-primary/40" : undefined}
                  onClick={() => irPara(m.monthISO)}
                >
                  {m.short}
                </Button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => irPara(currentMonth)}
          >
            Mês atual
          </Button>
        </PopoverContent>
      </Popover>

      <Button asChild variant="ghost" size="icon-sm" className="rounded-l-none" aria-label="Próximo mês">
        <Link href={`${basePath}?month=${next}`}>
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Confirmar que nenhuma tela precisou mudar**

Run: `grep -rn "MonthNav" app --include="*.tsx"`
Expected: as três chamadas (`/mes`, `/dashboard`, `/cartoes`) passando só `month` e `basePath`, sem alteração necessária.

- [ ] **Step 3: Verificar**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: suíte verde, tsc limpo, lint 0 erros (4 warnings pré-existentes), build ok.

- [ ] **Step 4: Commit**

```bash
git add components/MonthNav.tsx
git commit -m "feat: seletor de mês e ano em popover"
```

---

### Task 3: Verificação de ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: suítes completas**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 2: e2e existente**

Run: `npm run e2e`
Expected: 7/7. Se falhar no passo de reset do banco com mensagem vazia, é instabilidade do Supabase — rode `npx tsx scripts/e2e-reset-db.ts` isolado e repita o e2e.

- [ ] **Step 3: verificação visual e funcional (dados reais, somente leitura)**

Suba o app compilado:

```bash
APP_PASSWORD=visual-teste AUTH_SECRET=visual-secret-apenas-local-0123456789abcdef npx next start -p 3189
```

Com Playwright (viewport 1280×800), logar e em `/mes`:

1. Clicar no rótulo do mês → screenshot com o popover aberto. **Conferir**: grade com 12 meses, mês atual destacado.
2. Clicar em ‹ na linha do ano → o ano exibido cai para 2025 **sem** mudar a URL.
3. Clicar em `mar` → conferir que a URL virou `/mes?month=2025-03` e que o rótulo mudou.
4. Reabrir o popover → conferir que o ano exibido é 2025 (o do mês da tela).
5. Clicar em **Mês atual** → conferir URL `/mes?month=2026-08`.
6. Screenshot final; encerrar o servidor.

Anexar os screenshots e o log das URLs ao relatório.
