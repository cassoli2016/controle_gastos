# Melhor visualização do mês — Design

**Data:** 2026-07-30
**Contexto:** No Dashboard de julho/2026, "Despesas R$ 1.150" e "Saldo −R$ 1.150" pareciam
errados para o usuário, que esperava ver os R$ 490 pendentes. A conta estava certa: "Despesas"
soma o planejado do mês inteiro (pago + pendente), o saldo ficou negativo porque o mês não tem
receita lançada, e nada na tela mostra o progresso de pagamento. Além disso, compras no cartão
caem na fatura do mês seguinte (regime de caixa) sem nenhuma visibilidade antecipada.

**Decisão de abordagem (aprovada pelo usuário):** "Cards enriquecidos" — manter a grade de
4 cards nas telas Dashboard e Mês, enriquecendo cada um com detalhe e progresso, mais
melhorias na lista de lançamentos.

**Decisão sobre cartão (tomada pelo agente após o usuário delegar):** dar visibilidade ao
valor já comprometido nas próximas faturas, SEM mudar o regime de competência. A alternativa
(lançar a conta no mês do consumo) mudaria o modelo de dados e arriscaria contagem em dobro
com o consolidado da fatura; fica registrada como possível evolução futura.

## 1. Novos helpers de cálculo (`lib/calc.ts`)

- `paidExpense(e: EntryView[]): number` — soma dos `plannedCents` das despesas **pagas**
  (o complemento de `remainingToPay`).
- `receivedIncome(e: EntryView[]): number` — soma dos `plannedCents` das receitas pagas.
- `progressPct(paidCents: number, totalCents: number): number` — 0–100 inteiro,
  `0` quando `totalCents <= 0` (guarda de divisão por zero).
- `isOverdue(row: { paid: boolean; categoryType: "INCOME" | "EXPENSE"; dueDay: number | null }, month: string, todayISO: string): boolean`
  — despesa não paga está atrasada quando: mês passado (`month < todayISO.slice(0,7)`), ou
  mês corrente com `dueDay < dia de hoje`. Receita, linha paga, mês futuro e `dueDay null`
  nunca estão atrasados.

Sem mudanças nas funções existentes — `plannedExpense`/`remainingToPay` continuam a fonte
dos totais.

## 2. `StatCard` enriquecido (`components/StatCard.tsx`)

Props novas, opcionais e retrocompatíveis:

- `detail?: string` — sub-linha em `text-xs text-muted-foreground` abaixo do valor.
- `progress?: number` — 0–100; barra fina (h-1, rounded) abaixo do detalhe, preenchimento na
  cor do tom do card (`bg-emerald-500` / `bg-rose-500` / etc., trilha `bg-muted`).

Sem props novas, o card renderiza exatamente como hoje.

## 3. Os 4 cards (Dashboard `app/(app)/dashboard/page.tsx` e Mês `app/(app)/mes/page.tsx`)

Mesmo comportamento nas duas telas:

- **Receitas** — valor: `plannedIncome`. Com receita: detalhe
  `"{recebido} recebido · {a receber} a receber"` + progresso. Sem receita nenhuma no mês:
  detalhe `"nenhuma receita lançada"`.
- **Despesas** — valor: `plannedExpense` (total do mês, como hoje). Detalhe:
  `"{pago} pago · {falta} falta"` + barra de progresso (pago/total).
- **Saldo** — com receita: comportamento atual. Sem receita (`plannedIncome === 0`): valor
  `"—"`, tom `default`, detalhe `"sem receitas lançadas"` — número negativo "fabricado" some.
- **Falta pagar** — valor: `remainingToPay` (como hoje). Detalhe: `"{N} contas"` (contagem de
  despesas reais não pagas, singular/plural), com sufixo `" + reserva"` quando a linha
  derivada da reserva do dia a dia está presente e tem valor > 0.

A contagem de contas usa os lançamentos REAIS (a reserva derivada não conta como "conta").

## 4. Próximas faturas de cartão (Dashboard)

Novo card "Próximas faturas" na grade 2×2 do Dashboard (vira 5 cards; grid md:grid-cols-2
apenas ganha uma célula):

- Query: `MonthlyEntry` com `cardId != null` nos meses `m+1..m+3` (relativos ao mês exibido),
  agrupado por mês em JS (mesmo padrão do gráfico de 12 meses).
- Exibe até 3 linhas `"Agosto · R$ X"` (competência formatada) com o total consolidado da(s)
  fatura(s) do mês; soma todos os cartões.
- Vazio: `"Nada comprometido nas próximas faturas."`
- Botão `"Ver cartões"` → `/cartoes`.
- Agrupamento por mês extraído como função pura testável `upcomingCardCommitments` em
  `lib/card-entry.ts` (domínio de fatura/consolidado), recebendo linhas
  `{month: string, plannedCents: number}` e devolvendo `{month, totalCents}[]` ordenado,
  sem meses zerados/vazios.

O gasto continua contando apenas no mês em que a fatura vence — este card é só visibilidade.

## 5. Lista de lançamentos (tela Mês)

- **Linha paga**: conteúdo com `opacity-60` (desktop `<tr>` e mini-card mobile); ações
  continuam clicáveis ("Desmarcar" já existe no PayCell).
- **Linha atrasada** (`isOverdue`): rótulo do dia em âmbar
  (`text-amber-600 dark:text-amber-400`) com sufixo `"⚠"` nas duas variantes.
- **Header da categoria**: contador `"2/4 pagos"` (INCOME: `"recebidos"`) ao lado do
  subtotal, contando apenas linhas reais (exclui a reserva derivada, que não é pagável).

## 6. Testes (vitest, `tests/`)

- `calc.test.ts`: `paidExpense`, `receivedIncome`, `progressPct` (incl. total 0),
  `isOverdue` (mês passado / corrente antes e depois do dueDay / futuro / paga / receita /
  dueDay null).
- Teste do agrupamento `upcomingCardCommitments` (meses vazios ficam de fora, soma de
  múltiplos cartões no mesmo mês).
- Nenhum teste de snapshot de página — as páginas são server components cobertos pelos
  smoke/e2e existentes.

## Fora de escopo

- Mudança de regime de competência (conta no mês do consumo pagada pela fatura seguinte).
- Redesenho "hero de progresso" (opção descartada na escolha de abordagem).
- Alterações no Panorama e no bot do Telegram.
