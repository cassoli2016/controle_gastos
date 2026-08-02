# Seletor de mês e ano que funciona no computador

**Data:** 2026-08-02
**Status:** Aprovado (design)
**Contexto:** O usuário relatou que no computador não consegue escolher mês e ano para ir direto a uma data — só as setas ‹ › funcionam, um mês por clique.

**Causa raiz (verificada no código):** `components/MonthNav.tsx` põe um `<input type="month">` com `opacity-0` por cima do rótulo. No celular, tocar o campo abre o seletor nativo — por isso funciona lá. No desktop não: o Chrome só abre o calendário ao clicar no ícone (que está invisível), e o **Safari do Mac nem suporta `type="month"`** — ele vira uma caixa de texto comum. O componente é usado em Mês, Dashboard e Cartões.

## Objetivo

Trocar o campo nativo por um seletor próprio que abre igual em qualquer navegador: ano + grade de meses.

## Componente — `components/MonthNav.tsx`

As setas ‹ › continuam iguais. O rótulo ("Agosto 2026") vira gatilho de um `Popover` (shadcn, já usado no projeto):

```
  ‹  Agosto 2026  ›
┌──────────────────────┐
│    ‹   2026   ›      │
│  jan  fev  mar  abr  │
│  mai  jun  jul [ago] │
│  set  out  nov  dez  │
│  ──────────────────  │
│      Mês atual       │
└──────────────────────┘
```

- **Linha do ano:** ‹ e › mudam apenas o ano exibido no popover (estado local), sem navegar. Assim dá para pular para 2028 sem passar por 24 meses.
- **Grade 4×3:** os 12 meses do ano exibido, rótulo curto em pt-BR (`jan`…`dez`). Clicar navega para `${basePath}?month=YYYY-MM` e fecha o popover.
- **Destaques:** o mês da tela usa `variant="default"` e `aria-current="true"`; o mês de hoje (quando visível na grade) ganha `ring-1 ring-primary/40` — os dois podem coincidir.
- **Mês atual:** botão no rodapé que navega para o mês de hoje (`todayISOInSaoPaulo().slice(0, 7)`) e fecha.
- Ao abrir, o ano exibido é o do mês da tela.
- O `<input type="month">` invisível é removido.

Acessibilidade: o Popover do Radix cuida de Esc e do foco; cada mês é um `<button>` real; o gatilho ganha `aria-label="Escolher mês e ano"`.

## Helpers — `lib/month-nav.ts` (puro, testável)

`shiftMonth` e `monthLabel` saem de dentro do componente (hoje sem teste) e ganham companhia:

```ts
/** "2026-08" + delta em meses → "2026-09" (delta negativo volta). */
export function shiftMonth(month: string, delta: number): string;

/** "2026-08" → "Agosto 2026" (pt-BR, capitalizado). */
export function monthLabel(month: string): string;

/** Os 12 meses do ano: { monthISO: "2026-01", short: "jan" }, em pt-BR. */
export function monthGrid(year: number): { monthISO: string; short: string }[];
```

O componente importa os três; nada mais muda nas telas que o usam.

## Testes — `tests/month-nav.test.ts`

- `shiftMonth`: +1 dentro do ano; +1 em dezembro vira janeiro do ano seguinte; −1 em janeiro volta para dezembro; delta grande (+14).
- `monthLabel`: `"2026-08"` → `"Agosto 2026"`; mês com acento (`"2026-03"` → `"Março 2026"`).
- `monthGrid`: 12 itens; primeiro `{ monthISO: "2026-01", short: "jan" }`; último `"2026-12"`/`"dez"`; rótulos minúsculos de 3 letras.

Comportamento do popover é verificado por screenshot na verificação manual (abrir, trocar de ano, clicar num mês e conferir a URL).

## Fora de escopo

- Escolher intervalo de meses (o Panorama já mostra todos).
- Atalhos de teclado além do que o Radix já dá.
- Mudar as setas ‹ › ou o lugar do componente nas telas.
