# Panorama: colunas de total por ano e total geral

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** O Panorama mostra mês a mês o que ainda falta pagar/receber, mas não responde "quanto falta neste ano?" nem "quanto falta no horizonte todo?" sem somar colunas na mão.

## Objetivo

Colunas derivadas de **total por ano** e **total geral**, na mesma leitura do resto da tela (o que ainda falta), sem mudar nada nas células de mês.

## Decisões do brainstorming

- **Somam "o que ainda falta"**, como as células (`remainingCents`): linha quitada soma zero, e somar as colunas de mês de um ano dá exatamente a coluna daquele ano. A alternativa (somar o previsto cheio) foi descartada por divergir do resto da tela.
- **Posição cronológica**: cada bloco de meses fecha com a coluna do seu ano; `TOTAL` encerra a tabela.
- **Sem coluna redundante**: ano com um único mês visível não ganha coluna (seria o mesmo número da célula ao lado); `TOTAL` só aparece quando há 2+ anos.
- Colunas de ano/total são **só leitura** — baixa e edição continuam nas células de mês.
- Somam apenas os **meses visíveis**. Como os meses ocultos são exatamente os quitados (`settledPastMonths`: nada a pagar e nada a receber), incluí-los não mudaria valor nenhum — a regra é "o que você vê soma".

## `lib/matrix.ts` — três helpers puros

```ts
/** Coluna da matriz: mês real, fechamento de ano ou total geral. */
export type MatrixColumn =
  | { kind: "month"; monthISO: string }
  | { kind: "year"; year: string; months: string[] }
  | { kind: "total"; months: string[] };

/**
 * Sequência de colunas a partir dos meses visíveis (ordenados): os meses, uma
 * coluna após o último mês de cada ano com 2+ meses, e o total geral quando
 * há 2+ anos.
 */
export function matrixColumns(visibleMonths: string[]): MatrixColumn[];

/** Soma um mapa mês→valor nos meses pedidos (chave ausente conta zero). */
export function sumMonths(byMonth: Record<string, number>, months: string[]): number;

/** Soma o que ainda falta nas células de uma linha, nos meses pedidos. */
export function rowRemainingTotal(row: Pick<MatrixRow, "cells">, months: string[]): number;
```

## Tela (`app/(app)/panorama/page.tsx`)

`const columns = matrixColumns(visibleMonths);` substitui `visibleMonths` nas **cinco** iterações da tabela — cabeçalho, subtotal de categoria, linhas de conta, "A receber", "A pagar" e "Saldo a realizar" —, cada uma ramificando por `col.kind`:

- **`month`**: exatamente o que já existe hoje (link do mês no cabeçalho, `CellAction` na célula, destaque do mês corrente).
- **`year`** / **`total`**: `<td>` de texto, `bg-muted/40` (ano) e `bg-muted/60 font-semibold` (total), valor calculado com os helpers. Cabeçalho: `2026` e `TOTAL`.

Regra de célula vazia igual à dos meses: linha **sem nenhum lançamento** nos meses da coluna mostra `—`; com lançamentos, mostra o valor (inclusive `0,00` quando tudo quitado).

O subtotal de categoria usa `sumMonths(section.totalsByMonth, col.months)`; as linhas usam `rowRemainingTotal(row, col.months)`; o rodapé usa `sumMonths` sobre `toReceiveByMonth`/`toPayByMonth`, e o saldo é `receber − pagar` dos mesmos meses.

A coluna "Conta" continua sticky; nada muda no scroll horizontal.

## Testes (`tests/matrix.test.ts`)

- `matrixColumns`: lista vazia → `[]`; dois anos completos → meses + `year` de cada + `total`; ano único → sem `total`; ano com um só mês visível → sem a coluna daquele ano (mas o outro ano, com 2+, tem a sua); `months` de cada coluna contém exatamente os meses daquele ano.
- `sumMonths`: soma só os meses pedidos, trata chave ausente como zero, lista vazia → 0.
- `rowRemainingTotal`: soma `remainingCents` das células existentes, ignora meses sem célula, célula paga contribui zero.

## Fora de escopo

- Somar o previsto cheio (coluna "custo do ano") — decisão explícita acima.
- Total por trimestre, média mensal ou projeção.
- Exportar a matriz.
