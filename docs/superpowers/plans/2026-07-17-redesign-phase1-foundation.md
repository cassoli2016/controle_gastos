# Redesign Fase 1 — Fundação Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer a fundação visual do redesign (shadcn/ui + tema azul claro/escuro + app shell responsivo + toasts + input de moeda), sem alterar domínio/dados, deixando as telas atuais funcionando dentro do novo shell.

**Architecture:** Adota shadcn/ui (Radix, componentes no repo) e `next-themes`. Novo app shell responsivo substitui a nav de links em `app/(app)/layout.tsx`. Toaster global (Sonner) e um `CurrencyInput` reutilizável entram como base para as Fases 2–4. Nenhuma Server Action / regra de domínio muda nesta fase.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, next-themes, lucide-react, sonner, Vitest.

## Global Constraints

- **Node:** 20+.
- **Sem mudanças de domínio/dados nesta fase:** não alterar `prisma/`, `lib/{money,calc,dates,validators,entries,import-normalize}`, nem as Server Actions. Só apresentação + o helper novo de máscara.
- **Dinheiro:** exibição via `formatCents` (pt-BR); valores em reais no banco. `tabular-nums` em colunas de dinheiro.
- **Tema:** claro/escuro via `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`), persistido; **accent azul**.
- **Acessibilidade:** usar os componentes shadcn/Radix (não recriar dropdown/dialog/toast à mão).
- **Verificação de cada task:** `npx tsc --noEmit` limpo + `npm run build` sem erro + `npm test` verde. Fluxo logado é teste manual (e2e adiado).
- **Commits:** um por task; terminam com o trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `components.json` | config shadcn (gerado pelo init) |
| `lib/utils.ts` | helper `cn()` (gerado pelo shadcn) |
| `components/ui/*` | componentes shadcn (button, card, input, select, dialog, alert-dialog, sheet, table, tabs, dropdown-menu, badge, skeleton, switch, sonner, label) |
| `app/globals.css` | tokens/CSS vars (override do primary para azul, claro/escuro) |
| `app/layout.tsx` | root: `ThemeProvider` + `suppressHydrationWarning` + `<Toaster/>` |
| `components/theme/ThemeProvider.tsx` | wrapper do next-themes |
| `components/theme/ThemeToggle.tsx` | botão claro/escuro |
| `components/app-shell/NavItems.ts` | lista de destinos (Dashboard/Mês/Itens/Categorias + ícones) |
| `components/app-shell/Sidebar.tsx` | sidebar desktop (item ativo destacado) |
| `components/app-shell/Topbar.tsx` | topbar (hambúrguer→Sheet no mobile, tema, sair) |
| `components/app-shell/MobileNav.tsx` | bottom nav mobile |
| `app/(app)/layout.tsx` | monta o shell (mantém `auth()`), renderiza children |
| `lib/currency-mask.ts` | lógica pura da máscara de moeda (testável) |
| `components/ui/currency-input.tsx` | input de moeda controlado (usa `lib/currency-mask`) |
| `tests/currency-mask.test.ts` | testes do helper de máscara |

---

## Task 1: Instalar e inicializar shadcn/ui + next-themes + tokens azul

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/*` (via CLI)
- Modify: `app/globals.css` (override primary → azul), `package.json` (deps)

**Interfaces:**
- Produces: componentes shadcn disponíveis em `@/components/ui/*`; `cn()` em `@/lib/utils`; tokens de tema (claro/escuro) com primary azul.

- [ ] **Step 1: Inicializar shadcn (Tailwind v4)**

```bash
npx shadcn@latest init
```
Escolhas: base color **Slate**, CSS variables **Yes**. (Se pedir, aceitar sobrescrever `globals.css` — vamos ajustar o primary depois.)

- [ ] **Step 2: Adicionar os componentes usados no redesign**

```bash
npx shadcn@latest add button card input label select dialog alert-dialog sheet table tabs dropdown-menu badge skeleton switch sonner
```

- [ ] **Step 3: Instalar next-themes**

```bash
npm install next-themes
```

- [ ] **Step 4: Override do primary para azul (claro/escuro) em `app/globals.css`**

No bloco `:root` e `.dark` gerados pelo shadcn, ajustar as vars de primary/ring para azul (Tailwind blue). Valores oklch:

```css
:root {
  --primary: oklch(0.546 0.245 262.881);            /* blue-600 */
  --primary-foreground: oklch(0.985 0 0);           /* branco */
  --ring: oklch(0.546 0.245 262.881);
}
.dark {
  --primary: oklch(0.623 0.214 259.815);            /* blue-500 */
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.623 0.214 259.815);
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` (limpo), `npm run build` (sem erro), `npm test` (verde).
Expected: build compila com os componentes; nenhuma tela quebrou (ainda não usamos os componentes).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: init shadcn/ui + next-themes + tokens azul (claro/escuro)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ThemeProvider + ThemeToggle

**Files:**
- Create: `components/theme/ThemeProvider.tsx`, `components/theme/ThemeToggle.tsx`
- Modify: `app/layout.tsx` (root)

**Interfaces:**
- Consumes: `next-themes`, shadcn `button`, `dropdown-menu`, `lucide-react` (Sun/Moon).
- Produces: `<ThemeProvider>` (client) para o root layout; `<ThemeToggle/>` (client) usável no topbar.

- [ ] **Step 1: `components/theme/ThemeProvider.tsx`**

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: `components/theme/ThemeToggle.tsx`**

```tsx
"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

- [ ] **Step 3: Envolver o root `app/layout.tsx`**

Adicionar `suppressHydrationWarning` no `<html>` e envolver `{children}` com o provider:

```tsx
// dentro de <html lang="pt-BR" suppressHydrationWarning>
// <body ...>
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  {children}
</ThemeProvider>
```
(Importar `ThemeProvider` de `@/components/theme/ThemeProvider`. Manter o restante do layout/metadata.)

- [ ] **Step 4: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (verde). Manual (opcional): `npm run dev`, alternar tema em `/login`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tema claro/escuro com next-themes + toggle" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: App shell responsivo + Toaster

**Files:**
- Create: `components/app-shell/NavItems.ts`, `Sidebar.tsx`, `Topbar.tsx`, `MobileNav.tsx`
- Modify: `app/(app)/layout.tsx`, `app/layout.tsx` (montar `<Toaster/>`)

**Interfaces:**
- Consumes: shadcn `sheet`, `button`, `cn`, `next/link`, `next/navigation` (`usePathname`), `lucide-react` icons, `ThemeToggle`, `signOut` (de `@/lib/auth`).
- Produces: shell responsivo que envolve as telas do grupo `(app)`.

- [ ] **Step 1: `components/app-shell/NavItems.ts`**

```ts
import { LayoutDashboard, CalendarDays, ListChecks, Tags } from "lucide-react";
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/mes", label: "Mês", icon: CalendarDays },
  { href: "/itens", label: "Itens", icon: ListChecks },
  { href: "/categorias", label: "Categorias", icon: Tags },
] as const;
```

- [ ] **Step 2: `Sidebar.tsx` (client, desktop)**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r p-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent")}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 3: `Topbar.tsx` (client) — hambúrguer→Sheet no mobile, tema, sair**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function Topbar({ signOutAction }: { signOutAction: () => Promise<void> }) {
  const path = usePathname();
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetTitle className="px-2 py-3">Gastos</SheetTitle>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                  className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    path.startsWith(href) ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent")}>
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
      <Link href="/dashboard" className="font-semibold">Gastos</Link>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <form action={signOutAction}>
          <Button variant="ghost" size="icon" aria-label="Sair" type="submit"><LogOut className="h-5 w-5" /></Button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: `MobileNav.tsx` (client, bottom nav)**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./NavItems";

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-xs",
              active ? "text-primary" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Montar em `app/(app)/layout.tsx` (server; mantém auth)**

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
import { MobileNav } from "@/components/app-shell/MobileNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  async function doSignOut() { "use server"; await signOut({ redirectTo: "/login" }); }
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar signOutAction={doSignOut} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
```

- [ ] **Step 6: `<Toaster/>` no root `app/layout.tsx`**

Importar `{ Toaster } from "@/components/ui/sonner"` e renderizar `<Toaster richColors position="top-center" />` dentro do `<ThemeProvider>` (após `{children}`).

- [ ] **Step 7: Verificar** — `npx tsc --noEmit`, `npm run build`, `npm test` (verde). Manual (opcional): navegar entre as telas; conferir sidebar (desktop) e bottom nav/Sheet (mobile) via responsive.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: app shell responsivo (sidebar/topbar/sheet/bottom-nav) + Toaster" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: CurrencyInput + helper de máscara (TDD)

**Files:**
- Create: `lib/currency-mask.ts`, `components/ui/currency-input.tsx`
- Test: `tests/currency-mask.test.ts`

**Interfaces:**
- Consumes: `formatCents` de `@/lib/money`.
- Produces:
  - `digitsToCents(raw: string): number` — extrai dígitos e interpreta como centavos ("12345"→12345; "1.234,50"→123450; ""→0).
  - `centsToReais(cents: number): number` — 12345 → 123.45 (para submeter em reais).
  - `CurrencyInput` (client): input controlado que exibe `formatCents(cents)` e mantém um `<input type="hidden" name=...>` com o valor em REAIS para a Server Action.

- [ ] **Step 1: Testes (RED)** — `tests/currency-mask.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { digitsToCents, centsToReais } from "@/lib/currency-mask";

describe("currency-mask", () => {
  it("digitsToCents lê apenas dígitos como centavos", () => {
    expect(digitsToCents("12345")).toBe(12345);
    expect(digitsToCents("R$ 1.234,50")).toBe(123450);
    expect(digitsToCents("")).toBe(0);
    expect(digitsToCents("abc")).toBe(0);
    expect(digitsToCents("007")).toBe(7);
  });
  it("centsToReais converte centavos em reais", () => {
    expect(centsToReais(123450)).toBeCloseTo(1234.5, 2);
    expect(centsToReais(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/currency-mask.test.ts` → FAIL.

- [ ] **Step 3: Implementar `lib/currency-mask.ts`**

```ts
export function digitsToCents(raw: string): number {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits === "") return 0;
  return parseInt(digits, 10);
}
export function centsToReais(cents: number): number {
  return cents / 100;
}
```

- [ ] **Step 4: Rodar (passa)** — `npx vitest run tests/currency-mask.test.ts` → PASS.

- [ ] **Step 5: `components/ui/currency-input.tsx` (client)**

```tsx
"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatCents } from "@/lib/money";
import { digitsToCents, centsToReais } from "@/lib/currency-mask";

export function CurrencyInput({ name, defaultCents = 0, id }: { name: string; defaultCents?: number; id?: string }) {
  const [cents, setCents] = useState(defaultCents);
  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        value={formatCents(cents)}
        onChange={(e) => setCents(digitsToCents(e.target.value))}
        className="text-right tabular-nums"
      />
      {/* valor em REAIS para a Server Action (schemas usam z.coerce.number em reais) */}
      <input type="hidden" name={name} value={centsToReais(cents)} />
    </>
  );
}
```

- [ ] **Step 6: Verificar** — `npm test` (novo total = anterior + 2), `npx tsc --noEmit`, `npm run build` (verdes).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: CurrencyInput com máscara pt-BR + helper testado" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Deferidos p/ Fases 2–4 (planos próprios depois)

- **Fase 2 (Mês):** aplicar o shell/estética à tela do mês, dialogs de pagar (com `CurrencyInput`)/adicionar/editar/lote, toasts em cada ação, empty-state, cards no mobile.
- **Fase 3 (Dashboard):** KPI cards, cards de gráfico, ranking, responsivo.
- **Fase 4 (Itens & Categorias):** tabelas/cards shadcn, dialogs de edição, AlertDialog de exclusão, toasts.

## Self-Review (feita)

- **Cobertura da spec (Fase 1):** shadcn init + tokens azul (Task 1), tema claro/escuro next-themes + toggle (Task 2), app shell responsivo topbar/sidebar/Sheet/bottom-nav + Toaster (Task 3), input de moeda pt-BR + helper testado (Task 4). Sem tocar domínio/dados. ✔
- **Placeholders:** nenhum "TBD"; passos com código têm o código; passos de CLI têm o comando exato.
- **Consistência de tipos:** `NAV_ITEMS` consumido igual em Sidebar/Topbar/MobileNav; `digitsToCents`/`centsToReais` batem com o teste e o uso em `CurrencyInput`; `formatCents` reutilizado; `signOutAction` passado do server layout para o `Topbar` client.
