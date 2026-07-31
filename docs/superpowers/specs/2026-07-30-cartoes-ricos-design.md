# Cards de Cartão Ricos — Design (Fase 3 do ciclo de melhorias)

**Data:** 2026-07-30
**Contexto:** Os cards da tela Cartões têm muito espaço vazio e escondem informação útil
(limite, fechamento/vencimento, o que vem pela frente). Design aprovado pelo usuário.

## 1. Limite do cartão + barra de uso

- Schema: `CreditCard.limitAmount Decimal? @db.Decimal(12, 2)` — migration `card_limit`
  (coluna nullable; única mudança de schema da fase).
- `cardSchema` (lib/validators): `limitAmount` opcional com o mesmo preprocess de
  closingDay (vazio → null), positivo. Forms Novo cartão/Editar ganham o campo
  "Limite (opcional)" com `CurrencyInput`; `createCard`/`updateCard` já repassam
  `parsed.data`.
- **Auto-preenchimento pela fatura**: o parser (`lib/bradesco-fatura.ts`) ganha
  `limitCents: number | null` (âncora `Limite de compras R$ X`); `applyBradescoFaturaImport`
  atualiza `limitAmount` do cartão quando presente. O preview exibe o limite lido.
- **Uso estimado**: `usedCents` = soma dos consolidados NÃO PAGOS do cartão do mês
  CORRENTE (todayISOInSaoPaulo) em diante — o saldo comprometido que o app conhece
  (sem encargos; rótulo "estimado"). Barra com `progressPct` e cor por faixa via helper
  puro `usageTone(pct)`: `emerald` < 60, `amber` < 85, `rose` ≥ 85. Texto:
  `"{usado} de {limite} · disponível {limite−usado} (estimado)"`. Sem `limitAmount`,
  nada é exibido.

## 2. Fechamento/vencimento no card principal

Chip `"Fecha {closingDay} · vence {dueDay}"` (mesmo formato da tabela Gerenciar) no header
do card, ao lado do nome. Campos nulos: omite a parte ausente; ambos nulos: sem chip.

## 3. Próximas faturas por cartão

Rodapé do card com os 3 meses seguintes ao mês exibido: `"set. de 2026 · R$ 1.503,66"`
(consolidado do cartão no mês; mês sem fatura fica de fora; nenhum → nada). Uma query
extra na página (`MonthlyEntry` com `cardId != null` e `month in [m+1..m+3]`), reuso de
`upcomingCardCommitments` filtrando por cartão.

## Testes

- Parser: `limitCents` = 1.350.000 na fixture real.
- `usageTone`: faixas 0/59/60/84/85/100.
- Uso estimado como função pura `estimateCardUsage(entries: { cents: number; paid: boolean }[])`
  (soma só não pagos) — teste com pagos misturados.

## Fora de escopo

- Encargos/juros no uso estimado; redesign de outras telas; limite de saque.
