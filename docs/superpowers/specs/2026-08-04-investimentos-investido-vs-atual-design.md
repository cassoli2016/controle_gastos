# Investido × Valor atual por ativo — Design

**Data:** 2026-08-04
**Motivação:** comparar quanto foi gasto e quanto vale agora. Hoje a comparação só existe agregada (cards do topo de /investimentos); a tabela da carteira mostra PM/Cotação unitários e um "Valor" que silenciosamente vira o custo quando falta cotação; o card do Dashboard mostra só o valor atual.

## Comportamento

### Tabela da carteira (`/investimentos`)

- Nova coluna **"Investido"** = custo da posição (cotas × PM; `costCents` já sai de `calcPosition` em `lib/investments.ts`).
- Coluna "Valor" renomeada para **"Valor atual"**; **sem cotação exibe "—"** (coerente com Cotação "—" e Resultado "—"), em vez do fallback silencioso para o custo.
- Ordem: Ativo | Cotas | PM | Cotação | **Investido** | **Valor atual** | Resultado | % cart. | Renda 12m | Ações.
- Os totais agregados (cards do topo, alocação) **não mudam**: posição sem cotação continua entrando pelo custo, como documenta o aviso "N ativo(s) sem cotação (entram pelo custo)".

### Card Investimentos (Dashboard)

- A linha de detalhe passa a incluir o investido: `"{N} ativos · investido {R$ X} · resultado {R$ Y} ({±Z%})"`.
- Valor grande do card continua sendo o valor atual da carteira.

## Arquitetura

- Só apresentação: `app/(app)/investimentos/page.tsx` (coluna) e `app/(app)/dashboard/page.tsx` (detalhe do card). `calcPosition`/`calcPortfolio` já expõem `costCents` — sem mudança em `lib/`, schema ou actions.

## Testes e verificação

- Sem lógica nova de cálculo (usa `costCents` existente, já testado em `tests/investments.test.ts`).
- Suítes completas + verificação visual (desktop/mobile) da tabela e do card.
