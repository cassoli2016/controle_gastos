# Panorama pelo que falta + Reserva do dia a dia

**Data:** 2026-07-26
**Status:** Aprovado (design)
**Contexto:** Dois pedidos do usuário, independentes entre si. (1) "Os valores do Panorama devem ir baixando conforme vou pagando as contas do mês" — hoje a célula mostra sempre o previsto, e a baixa só muda a cor. (2) "Eu deixo de reserva todos os meses o valor de 100 reais por dia do mês, ou seja, se o mês tem 31 dias fica 3100 reais no primeiro dia e vai baixando conforme passam os dias."

## Objetivo

1. O Panorama passa a responder "quanto ainda falta" em vez de "quanto custa": célula, subtotal de categoria e rodapé todos refletem o que resta a pagar/receber.
2. Um indicador de reserva do dia a dia mostra, para o mês em tela, o valor por dia × dias restantes — caindo a cada dia que passa, sem depender de nenhum pagamento.

## Decisões do brainstorming

- **A célula vira o que falta** (não uma linha nova de "Falta pagar" no rodapé). O usuário escolheu isso ciente do custo: a coluna de um mês quase todo pago não é mais comparável com a de um mês futuro intocado, porque o custo do mês some conforme ele paga. O previsto continua acessível no popover da célula e na tela Mês.
- **O rodapé acompanha a célula.** Somar as células de uma coluna dá exatamente o número do rodapé. "Saldo" passa a significar quanto o mês ainda mexe no bolso daqui para frente.
- **Os R$ 100/dia são orçamento do dia a dia**, não dinheiro guardado nem despesa nova. Os gastos reais já entram pela fatura do cartão, então nada é somado duas vezes: a reserva é uma meta, fora do Saldo e fora do "Total guardado" das caixinhas.
- **O indicador só mostra a reserva caindo por dia** — sem comparação com o gasto real. Comparar exigiria definir "gasto de dia a dia", e as linhas do extrato (`CardTransaction`) não têm categoria: só descrição, valor e data. Fica como evolução futura.

## Parte 1 — Panorama pelo que falta

### Regra

Por ocorrência: `restante = paga ? 0 : previsto`. A célula soma o restante das suas ocorrências.

Pagamento com valor diferente do previsto **não** deixa resto: uma conta de R$ 200 baixada com R$ 180 está quitada, e a diferença é só o que ela custou a menos. Marcar como paga zera o restante daquela ocorrência.

### Célula

| estado | valor exibido | cor |
|---|---|---|
| nenhuma ocorrência paga | o previsto (idêntico a hoje) | normal |
| parcial (5 de 10) | o que falta (250,00) + contagem `5/10` | âmbar |
| todas pagas | `0,00` | verde |

Célula quitada mostra **`0,00`**, não `—`: hoje `—` significa "não existe lançamento neste mês", e usar o mesmo símbolo apagaria a diferença entre *quitado* e *inexistente*.

O popover passa a mostrar as duas informações, para o previsto não se perder:

```
Almoço
jul/26 · falta R$ 250,00 de R$ 500,00 · 10 ocorrências · 5 pagas
```

O campo de edição do previsto no popover continua carregando o **previsto** (não o restante) — é o valor que ele edita.

### Rodapé e subtotais

Rodapé e subtotais de categoria passam a somar o restante. Os rótulos do rodapé mudam, senão passam a mentir (hoje diriam "Receitas R$ 0,00" num mês cujo salário já caiu):

| hoje | passa a ser |
|---|---|
| Receitas | **A receber** |
| Despesas | **A pagar** |
| Saldo | **Saldo a realizar** |

```
                 jul/26      ago/26
Almoço           250,00      500,00
Diarista         440,00      880,00
Luz                0,00      180,00   ← verde

A receber          0,00    9.000,00
A pagar          690,00    1.560,00
Saldo a realizar -690,00   7.440,00
```

O texto de ajuda do topo passa a explicar a nova leitura: *valores = o que ainda falta · verde = quitado · âmbar = parcial*.

**Zero deixa de ser tratado como vazio.** Hoje o rodapé e o subtotal de categoria testam o valor por truthiness (`totalsByMonth[m] ? fmt(...) : ""` e `incomeByMonth[m] ? fmt(...) : "—"`), o que era inofensivo quando zero significava "não tem lançamento". Com o restante, zero passa a ser o caso comum de "está tudo quitado" — e sumir com o número seria mentira. A distinção passa a ser feita pela existência da chave (`m in totalsByMonth`), não pelo valor: mês com lançamentos e nada a pagar mostra `0,00`; mês sem lançamento nenhum na categoria continua vazio.

### Camada de domínio

`lib/matrix.ts` — `MatrixEntry` não muda (`cents` + `paid` já bastam para derivar o restante).

- `MatrixCell` ganha `remainingCents: number`. `cents` continua sendo o previsto, porque o popover mostra os dois.
- `MatrixRow.totalCents` continua sendo a soma dos **previstos** (não é exibido na UI hoje; o comentário do campo passa a dizer isso explicitamente, para ninguém confundir depois).
- `MatrixSection.totalsByMonth` passa a somar o restante — comentário atualizado.
- `incomeByMonth`/`expenseByMonth` são **renomeados** para `toReceiveByMonth`/`toPayByMonth` e passam a somar o restante. Renomear é barato (`buildMatrix` só é consumido por `app/(app)/panorama/page.tsx` e pelos testes) e evita que alguém leia o nome antigo esperando o previsto. `balanceByMonth` mantém o nome, com o comentário dizendo que agora é `a receber − a pagar`.

`app/(app)/panorama/CellAction.tsx` — ganha a prop `remainingCents`; exibe o restante no botão, mantém `cents` no campo de edição, e mostra ambos no resumo do popover.

## Parte 2 — Reserva do dia a dia

### Modelo

```prisma
// Orçamento do dia a dia: teto diário de gasto variável (mercado, combustível,
// lanches). O mês reserva amountPerDay × dias do mês, e o que resta cai
// amountPerDay a cada dia que passa. Linha única (id "default").
model DailyBudget {
  id           String   @id @default("default")
  amountPerDay Decimal  @db.Decimal(12, 2)
  updatedAt    DateTime @updatedAt
}
```

Tabela de linha única em vez de constante no código, para o usuário mudar o valor sem deploy. Sem linha cadastrada, o app trata como **não configurado** e não exibe o card — nenhum valor mágico embutido.

### Cálculo (função pura)

`lib/daily-budget.ts`:

```ts
export type DailyBudgetView = {
  perDayCents: number;
  daysInMonth: number;
  /** Dias que ainda podem ser gastos, incluindo hoje. */
  daysRemaining: number;
  /** perDayCents × daysInMonth. */
  monthTotalCents: number;
  /** perDayCents × daysRemaining. */
  remainingCents: number;
};

export function dailyBudget(month: string, todayISO: string, perDayCents: number): DailyBudgetView;
```

Regra de `daysRemaining`:

| mês em tela | dias restantes |
|---|---|
| futuro (ainda não começou) | todos os dias do mês |
| corrente | `dias do mês − dia de hoje + 1` |
| passado | 0 |

Hoje **conta** como dia restante, porque o dia corrente ainda pode ser gasto — é o que faz o dia 1 de um mês de 31 dias valer R$ 3.100, como o usuário descreveu.

```
julho/26 (31 dias, R$ 100/dia):  dia 1 → 3.100 · dia 26 → 600 · dia 31 → 100
agosto/26 visto em 26/07:        3.100 (mês futuro, nada consumido)
junho/26 visto em 26/07:         0 (mês passado)
```

`todayISO` vem de `todayISOInSaoPaulo()` (`lib/fatura.ts`) — mesma fonte de "hoje" que o resto do app, para não depender do fuso do servidor.

### Telas

- **Dashboard** e **tela Mês** — um `StatCard` a mais, "Reserva do dia a dia", com o restante como valor e `6 de 31 dias · R$ 100,00/dia` como detalhe. Segue o mês selecionado na tela (as duas já têm `MonthNav`). As duas grades hoje são `grid-cols-2 md:grid-cols-4` com 4 cards; passam a `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` — cinco valores monetários lado a lado não caberiam legíveis em 768px.
- **Reservas** — o mesmo card, com edição inline do valor por dia (Server Action + `useActionToast`, no padrão das outras telas). É onde o valor é configurado.
- O card diz explicitamente que é meta: não entra no "Total guardado" das caixinhas nem no Saldo do mês.

### Camada de domínio

- `lib/daily-budget.ts` — função pura acima, sem acesso a banco.
- `lib/planning.ts` — ganha `getDailyBudget(): Promise<{ perDayCents: number } | null>` (null = não configurado), ao lado de `getReserves`.
- `app/(app)/reservas/actions.ts` — `setDailyBudget` (upsert da linha única, valor > 0), retornando `ActionState` e chamando `revalidateFinance()`.
- `lib/validators.ts` — `dailyBudgetSchema` (valor positivo).

## Testes

- `tests/daily-budget.test.ts` (novo) — dia 1, dia do meio, último dia, mês passado, mês futuro, fevereiro de 28 e de 29 dias, e virada de mês (o dia 31 de um mês de 31 dias vale exatamente um dia).
- `tests/matrix.test.ts` — `remainingCents` nos três estados (nada pago, parcial, tudo pago); rodapé somando o restante; `MatrixRow.totalCents` continuando a somar o previsto.
- `tests/validators.test.ts` — `dailyBudgetSchema` rejeitando zero e negativo.

## Fora de escopo

- Comparar a reserva com o gasto real (exige categoria nas linhas do extrato do cartão, que hoje não existe).
- A reserva como linha do Panorama ou do mês — ela é meta, não lançamento.
- Reserva com valor por dia diferente por mês, ou por dia da semana.
- Rever a decisão de perder a comparabilidade entre colunas do Panorama: o usuário escolheu isso de forma explícita, ciente do custo.
