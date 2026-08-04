# Fluxo de caixa por dia — Design

**Data:** 2026-08-04
**Motivação:** a tela Mês mostra o total e o que falta, mas não *quando* o dinheiro entra e sai dentro do mês — a pergunta "vou passar aperto antes do salário cair?" fica sem resposta.

## Semântica (decisões do usuário)

- **Acumulado do mês partindo de zero**: dia 1 começa em R$ 0; cada dia soma entradas e subtrai saídas. Dia negativo = até aquela data saiu mais do que entrou no mês. Sem saldo bancário inicial e sem emenda com o mês anterior.
- **Híbrido realizado + previsto**: conta paga/recebida entra na **data real** (`paidDate`) com o **valor real** (`paidCents`, fallback `plannedCents`); conta em aberto entra na **data prevista**. Mês passado fica todo realizado (o não pago fica na data prevista); mês futuro, todo previsto; mês corrente mistura os dois.
- **Data prevista** de uma linha em aberto: `dueDay` (dia do mês) ou dia de `purchaseDate`; **sem nenhuma data → pessimista**: despesa no dia 1, receita no último dia do mês.
- **Reserva do dia a dia**: distribuída como `perDayCents` em cada dia que ela cobre (dias restantes no mês corrente, todos os dias no futuro, nenhum no passado) — a soma bate com a linha derivada da lista.
- Datas em UTC (`getUTCDate()`), padrão do app.

## Saída do cálculo

`lib/cashflow.ts` (puro, testado em `tests/cashflow.test.ts`):

- Série diária: para cada dia 1..N do mês, `{ day, inCents, outCents, cumulativeCents }`.
- **Veredito do mês**: `{ alwaysPositive: true }` ou `{ alwaysPositive: false, firstNegativeDay, lastNegativeDay, minCents, minDay }` — alimenta o cabeçalho do card ("✓ Positivo o mês todo" / "⚠️ R$ −Z no dia W").

## UI — card "Fluxo de caixa" na tela Mês

- Posição: entre os 4 stat cards e o campo de busca.
- **Recolhido por padrão** (não empurra a lista no celular), com o **veredito sempre visível no cabeçalho**: verde quando positivo o mês todo; âmbar com o mínimo e o dia quando fica negativo. Chevron e `aria-expanded` como nos cards de reserva; estado não persiste (trocar de mês volta ao padrão).
- Expandido: **gráfico de área (Recharts**, já usado no app) do acumulado dia a dia — linha de referência no zero, trecho abaixo de zero destacado em vermelho/rose, marcador vertical "hoje" no mês corrente, tooltip por dia com entradas, saídas e saldo acumulado (formatação pt-BR em centavos como o resto do app).
- Respeita o mês navegado (‹ › e seletor); mês vazio não mostra o card (segue o `isEmpty` da página).

## Arquitetura

- `lib/cashflow.ts` (novo, puro): recebe as linhas já montadas pela página (mesma fonte de `views`, incluindo a linha derivada da reserva via `budgetLine`), `month` e `todayISO`; devolve série + veredito. Sem query nova.
- `app/(app)/mes/CashflowCard.tsx` (novo, client): colapso + Recharts. A página passa a série/veredito prontos (serializáveis).
- `app/(app)/mes/page.tsx`: calcula no server e renderiza o card entre os stat cards e o `MonthEntryList`.
- Sem mudança de schema ou actions.

## Testes e verificação

- Unit `tests/cashflow.test.ts`: acumulado simples; pago em data real × aberto em data prevista; pessimista (despesa dia 1, receita último dia); reserva diluída; veredito (sempre positivo, negativo com mínimo); mês passado/futuro/corrente.
- Suítes completas + e2e existente.
- Visual (desktop + mobile, dados reais somente leitura): card recolhido com veredito, expandido com gráfico, tooltip, navegação de mês.

## Entrega

- Versão **1.2.0** + entrada no changelog (política de entrega padrão).
