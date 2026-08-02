# Exportar lançamentos e extrato em CSV

**Data:** 2026-08-02
**Status:** Aprovado (design)
**Contexto:** Hoje o banco é a única cópia dos dados sob controle do usuário (o Supabase tem backup, mas ele não gerencia). O usuário veio de planilha, então CSV é o formato familiar para conferir e guardar.

## Objetivo

Dois downloads a um clique — **lançamentos** e **extrato de cartão** — em CSV que abre limpo no Excel em português.

## Decisões do brainstorming

- **Escopo:** lançamentos (`MonthlyEntry`) e extrato (`CardTransaction`). Itens, categorias, caixinhas e investimentos ficam de fora — o histórico financeiro está nos dois primeiros.
- **Lugar:** um bloco "Exportar" no rodapé do Panorama, que já é a visão completa.
- **Formato:** separador `;`, vírgula decimal e BOM UTF-8 — abre no Excel pt-BR com dois cliques, sem assistente de importação.

## Segurança — o ponto que exige atenção

`middleware.ts` protege só as telas (`/dashboard`, `/mes`, …); **`/api/*` não está no matcher**. Uma rota de export sem proteção seria pública: qualquer pessoa com a URL baixaria o histórico financeiro inteiro.

As rotas verificam a sessão elas mesmas, com o `auth()` que `lib/auth.ts` já exporta:

```ts
const session = await auth();
if (!session) return new Response("Não autorizado", { status: 401 });
```

Escolhi o guard na rota em vez de acrescentar `/api/export/:path*` ao matcher porque o middleware responde com **redirecionamento HTML** para o login — num download isso baixaria uma página de login disfarçada de CSV. Com o guard, o erro é um 401 honesto.

## `lib/csv-export.ts` — serialização (puro, testável)

```ts
/** Uma linha já em texto: cada célula vira string antes de virar CSV. */
export type CsvCell = string | number | null | undefined;

/** Monta o CSV inteiro: BOM + cabeçalho + linhas, separador ";", CRLF. */
export function toCsv(headers: string[], rows: CsvCell[][]): string;

/** Centavos → "1234,56" (vírgula decimal, sem separador de milhar nem "R$"). */
export function csvMoney(cents: number): string;

/** Date | null → "02/08/2026" (vazio quando null). */
export function csvDate(d: Date | null): string;
```

Regras de `toCsv`:

- Célula `null`/`undefined` vira string vazia.
- Célula que contenha `;`, `"`, `\n` ou `\r` é envolvida em aspas duplas, com aspas internas duplicadas (`"` → `""`) — RFC 4180.
- Linhas terminam em `\r\n`; o texto começa com BOM (`﻿`).

## Rotas

`app/api/export/lancamentos/route.ts` e `app/api/export/extrato/route.ts`, ambas `dynamic = "force-dynamic"`, com o guard de sessão acima. Respondem:

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="grana-lancamentos-2026-08-02.csv"
```

(o nome usa a data de São Paulo via `todayISOInSaoPaulo()`, invertida para `DD-MM-AAAA`).

**Lançamentos** — todos, ordenados por competência e descrição. Colunas:
`Competência; Descrição; Categoria; Tipo; Cartão; Data; Previsto; Pago; Valor pago; Data do pagamento; Parcela`
- Descrição: nome do item, senão nome do cartão, senão a descrição do lançamento.
- Tipo: `Receita`/`Despesa`. Pago: `Sim`/`Não`. Parcela: `3/10` quando houver, vazio quando não.

**Extrato** — todas as linhas, ordenadas por fatura e data. Colunas:
`Cartão; Fatura; Data da compra; Descrição; Valor; Parcela; Tipo`
- Tipo: `Antecipação` quando `prepayment`, `Assinatura` quando tem `subscriptionId`, `Estorno` quando o valor é negativo, senão `Compra`.

## UI

No rodapé do Panorama, dentro do mesmo `Card`, um bloco discreto com borda superior:

> **Exportar** — Uma cópia dos seus dados em CSV (abre no Excel).
> [⬇ Lançamentos] [⬇ Extrato de cartão]

Botões `variant="outline" size="sm"` embrulhando `<a href="/api/export/…" download>` — download direto, sem estado de cliente.

## Testes — `tests/csv-export.test.ts`

- `toCsv`: cabeçalho e linhas; BOM no início; CRLF entre linhas; célula com `;` sai entre aspas; célula com aspas duplica as aspas; célula com quebra de linha sai entre aspas; `null`/`undefined` viram vazio; sem linhas devolve só BOM + cabeçalho.
- `csvMoney`: 123456 → `1234,56`; 0 → `0,00`; negativo → `-50,50`.
- `csvDate`: data UTC → `DD/MM/AAAA`; `null` → vazio.

As rotas não têm harness de teste (convenção do projeto): a verificação é baixar os dois arquivos em produção e conferir o conteúdo.

## Fora de escopo

- Exportar itens, categorias, caixinhas, investimentos e dividendos.
- Reimportar o CSV exportado (o importador existente tem outro formato).
- Filtro por período no export (sai tudo).
- Agendar backup automático.
