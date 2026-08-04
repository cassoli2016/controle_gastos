# Fluxo de caixa por dia — Design

**Data:** 2026-08-04
**Motivação:** a tela Mês mostra o total e o que falta, mas não *quando* o dinheiro entra e sai dentro do mês — a pergunta "vou passar aperto antes do salário cair?" fica sem resposta.

## Semântica (decisões do usuário)

- **Acumulado do mês partindo de zero**: dia 1 começa em R$ 0; cada dia soma entradas e subtrai saídas. Dia negativo = até aquela data saiu mais do que entrou no mês. Sem saldo bancário inicial e sem emenda com o mês anterior.
- **Valor: sempre o previsto** (`plannedCents`), pago ou não — o mesmo valor que os stat cards do topo somam, o que garante a reconciliação (acumulado do último dia = receitas − despesas − reserva). *Motivo (decisão do dono do produto, revisão da v1.2.0):* usar `paidCents` contava a mesma despesa duas vezes quando a cobrança de uma assinatura/renovação é consumida pela fatura — o app abate o previsto da linha provisionada e marca pago com o valor da cobrança, que já vive dentro do consolidado do cartão.
- **Data: híbrida realizado + previsto**: conta paga/recebida entra na **data real** (`paidDate`); conta em aberto entra na **data prevista**. Mês passado fica todo nas datas reais (o não pago fica na data prevista); mês futuro, todo previsto; mês corrente mistura os dois. É o *quando* que muda com o pagamento, não o *quanto*.
- **Data prevista** de uma linha em aberto: `dueDay` (dia do mês) ou dia de `purchaseDate`; **sem nenhuma data → pessimista**: despesa no dia 1, receita no último dia do mês.
- **Reserva do dia a dia**: distribuída como `perDayCents` em cada dia que ela cobre (dias restantes no mês corrente, todos os dias no futuro, nenhum no passado) — a soma bate com a linha derivada da lista.
- Datas em UTC (`getUTCDate()`), padrão do app.

## Saída do cálculo

`lib/cashflow.ts` (puro, testado em `tests/cashflow.test.ts`):

- Série diária: para cada dia 1..N do mês, `{ day, inCents, outCents, cumulativeCents }`.
- **Veredito do mês**: `{ alwaysPositive: true, minCents, minDay }` ou `{ alwaysPositive: false, negativeRanges: { from, to }[], minCents, minDay }` — alimenta o cabeçalho do card ("✓ Positivo o mês todo" / "⚠️ R$ −Z no dia W") e a frase-resumo. Os **trechos contíguos** existem porque o mês pode alternar (negativo → positivo → negativo): dizer "do primeiro ao último dia negativo" seria falso. O mínimo aparece também no caso positivo, para o card sempre ter frase-resumo (alternativa textual do gráfico).

## UI — card "Fluxo de caixa" na tela Mês

- Posição: entre os 4 stat cards e o campo de busca.
- **Recolhido por padrão** (não empurra a lista no celular), com o **veredito sempre visível no cabeçalho**: verde quando positivo o mês todo; âmbar com o mínimo e o dia quando fica negativo. Chevron e `aria-expanded` como nos cards de reserva; estado não persiste (trocar de mês volta ao padrão).
- Expandido: **frase-resumo sempre presente** (descreve os trechos negativos, ou o menor saldo quando o mês é positivo) + **gráfico de área (Recharts**, já usado no app) do acumulado dia a dia — linha de referência no zero, trecho abaixo de zero destacado em vermelho/rose, marcador vertical "hoje" no mês corrente, tooltip por dia com entradas, saídas e saldo acumulado (formatação pt-BR em centavos como o resto do app).
- Respeita o mês navegado (‹ › e seletor); mês vazio não mostra o card (segue o `isEmpty` da página).

## Arquitetura

- `lib/cashflow.ts` (novo, puro): recebe as linhas já montadas pela página (mesma fonte de `views`, incluindo a linha derivada da reserva via `budgetLine`), `month` e `todayISO`; devolve série + veredito. Sem query nova.
- `app/(app)/mes/CashflowCard.tsx` (novo, client): colapso + veredito + frase-resumo. A página passa a série/veredito prontos (serializáveis).
- `app/(app)/mes/CashflowChart.tsx` (novo, client): concentra TODOS os imports do Recharts e é carregado por `next/dynamic` (`ssr: false`) só quando o card é expandido — a tela mais usada do app não paga ~1,9 MB de JS por um card que começa recolhido.
- `app/(app)/mes/page.tsx`: calcula no server e renderiza o card entre os stat cards e o `MonthEntryList`, com `key={`cashflow-${month}`}` (recolher ao trocar de mês, já que a navegação é soft). *Prefixo obrigatório:* `MonthEntryList` é irmão no mesmo nível com `key={month}` — key idêntica entre irmãos fazia o React manter os dois cards no DOM na troca de mês.
- Sem mudança de schema ou actions.

## Testes e verificação

- Unit `tests/cashflow.test.ts`: acumulado simples; pago na data real com o valor previsto × aberto na data prevista; assinatura consumida pela fatura não conta; pessimista (despesa dia 1, receita último dia); reserva diluída **e igual à `dailyBudgetLine`** (passado/corrente/futuro); reconciliação do último dia com receitas − despesas − reserva; veredito com trechos alternados; frase-resumo em cada forma; curva plana.
- Suítes completas + e2e existente.
- Visual (desktop + mobile, dados reais somente leitura): card recolhido com veredito, expandido com gráfico, tooltip, navegação de mês.

## Entrega

- Versão **1.2.0** + entrada no changelog (política de entrega padrão).
