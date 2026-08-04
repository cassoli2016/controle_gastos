---
type: Metric
title: Saldo (previsto do mês)
description: Resultado planejado do mês inteiro — receitas previstas menos despesas previstas, pagas ou não.
tags: [saldo, mes, dashboard, metricas]
timestamp: 2026-08-04
---

# Saldo (previsto do mês)

Card "Saldo" nas telas **Mês** (`/mes`) e **Dashboard** (`/dashboard`), via `components/MonthStatCards.tsx`.

## Fórmula

`plannedBalance(views)` em `lib/calc.ts`:

```
saldo = Σ plannedCents (receitas) − Σ plannedCents (despesas)
```

- Usa o valor **previsto** (`plannedCents`) de **todos** os lançamentos do mês, **independente de estarem pagos/recebidos** — dar baixa numa conta não move este número; só editar valores previstos (ou criar/excluir lançamentos) move.
- Inclui a linha derivada "reserva do dia a dia" (despesa calculada do calendário, `lib/daily-budget.ts`), que decai ao longo do mês corrente — por isso o saldo do mês corrente sobe um pouco a cada dia.
- Mês sem nenhuma receita lançada exibe "—" em vez de um valor só-despesas (decisão de UX em `MonthStatCards`).

## Interpretação

"Se tudo que está previsto entrar e tudo for pago, sobra isso." No fim do mês, com tudo quitado, continua mostrando o resultado planejado.

## Relação com outras métricas

- [Saldo a realizar](saldo-a-realizar.md) (Panorama) considera **só o que ainda não foi baixado**. Diferença entre os dois = líquido já realizado (recebido − pago).
- Dados de origem: [contas-fixas](contas-fixas.md) e lançamentos avulsos/cartão (`MonthlyEntry`).
