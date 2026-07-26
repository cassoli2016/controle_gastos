# Reserva do dia a dia como despesa do mês

**Data:** 2026-07-26
**Status:** Aprovado (design)
**Contexto:** Reverte parte de [2026-07-26-panorama-falta-reserva-diaria-design.md](2026-07-26-panorama-falta-reserva-diaria-design.md). Naquele spec a reserva de R$ 100/dia foi implementada como **meta**, fora de todas as somas, porque os gastos do dia a dia já entram pela fatura do cartão. O usuário reviu a decisão: *"Quero que esse valor faça parte das somas, pois deve ser como se fosse um valor a pagar todos os dias e passando os dias esse valor vai baixando."*

## Objetivo

A reserva do dia a dia passa a ser uma **despesa do mês** — linha própria na tela Mês e no Panorama, entrando em todos os totais — cujo valor é `dias restantes × valor por dia` e portanto cai sozinho a cada dia que passa.

## Decisões do brainstorming

- **Linha própria**, não apenas um valor embutido nos totais. Assim somar a coluna continua fechando com o rodapé, e o usuário vê de onde vem o número.
- **Mês passado vale zero.** Consequência que o usuário aceitou explicitamente: o gráfico de saldo mensal mostra meses antigos melhores do que foram. Em troca, o número é **um só** — `dias restantes × valor por dia` — sem um "previsto" separado do "restante". Mês futuro = mês cheio; mês corrente decaindo; mês passado zero.
- **Entra nos gráficos** do Dashboard (pizza por categoria e ranking). Ela vira a maior fatia num mês futuro, mas a pizza continua somando o mesmo que o card "Despesas".
- **O card "(meta)" sai** da tela Mês e do Dashboard: com a linha na lista e o valor dentro de Despesas/Saldo, ele repetiria o mesmo número e o rótulo "meta" passaria a ser falso. O card de Reservas fica — é onde o valor por dia é editado — com o texto corrigido.

## Por que não duplica com a fatura do cartão

O risco de contar o mesmo dinheiro duas vezes existiria se o mês somasse os R$ 3.100 cheios: os gastos do dia a dia já chegam pela fatura. Como o que entra na soma é só o **restante**, os dias já vividos saem da conta da reserva no mesmo ritmo em que aparecem no cartão — os dois nunca contam o mesmo dia. No fim do mês a reserva chega a zero e só a fatura resta.

## Impacto medido nos dados reais (R$ 100/dia)

```
2026-07  saldo  -R$ 1.380,00   reserva R$ 600,00   →   -R$ 1.980,00
2026-08  saldo -R$ 12.403,09   reserva R$ 3.100,00 →  -R$ 15.503,09
2026-11  saldo     R$ 161,23   reserva R$ 3.000,00 →   -R$ 2.838,77
2027-02  saldo   R$ 2.520,69   reserva R$ 2.800,00 →     -R$ 279,31

meses no vermelho: 4 → 11 (de 23)
```

Registrado para leitura honesta do resultado: esses saldos já estavam negativos porque **quase nenhum mês tem receita lançada** (jul/26 só tem Almoço e Diarista). Os "11 meses no vermelho" dirão mais sobre receita faltando do que sobre a reserva.

## Arquitetura: linha derivada, não gravada

A reserva **não** vira `MonthlyEntry`. É calculada na leitura, a partir do valor por dia (`DailyBudget.amountPerDay`, já existente) e do calendário.

Gravar seria pior: uma linha no banco não cai sozinha — precisaria de um job diário reescrevendo o valor, e ficaria errada em qualquer dia em que o job não rodasse. Derivar é sempre correto e não tem migração nem backfill.

### `lib/daily-budget.ts`

Ganha o descritor da linha, ao lado do cálculo que já existe:

```ts
/** Nome da linha e da categoria da reserva na visão mensal. */
export const DAILY_BUDGET_LINE = "Reserva do dia a dia";

/** Linha derivada da reserva num mês — não existe no banco, não é paga nem editada. */
export type DailyBudgetLine = {
  line: string;
  categoryName: string;
  categoryType: "EXPENSE";
  /** `perDayCents × daysRemaining`: mês cheio no futuro, decaindo no corrente, 0 no passado. */
  cents: number;
  daysRemaining: number;
  daysInMonth: number;
  perDayCents: number;
  /** "6 de 31 dias · R$ 100,00/dia" — explica de onde vem o valor. */
  hint: string;
};

export function dailyBudgetLine(month: string, todayISO: string, perDayCents: number): DailyBudgetLine;
```

`dailyBudget()` e `daysInMonth()` continuam como estão. A linha existe sempre que a reserva está configurada, inclusive em mês passado (com `cents: 0`) — foi a escolha do usuário.

Cada tela mapeia o descritor para a sua própria forma (`EntryView`/`DisplayRow`, `MatrixEntry`). São 2-4 linhas por tela, e as formas são genuinamente diferentes; um adaptador único acabaria sendo mais indireção do que economia.

### Tela Mês (`app/(app)/mes/page.tsx`)

A linha derivada é injetada em `views` **antes** de `groupByCategory` e dos cálculos — assim a lista e os totais (`plannedExpense`, `plannedBalance`, `remainingToPay`) saem do mesmo array, sem chance de divergir.

`DisplayRow` ganha `readOnlyHint: string | null`. Quando preenchido, `EntryRow` renderiza o hint em lugar do `PayCell` e não renderiza `PlannedCell` nem `EntryActions` — a reserva não é paga, editada nem excluída. `entryId` recebe a chave estável `"daily-budget"` (usada só como `key` do React).

**Exclusão obrigatória:** `TransferDialog` recebe `views.map((v) => ({ id: v.entryId, ... }))`; a linha derivada precisa ficar fora dessa lista, senão aparece como origem/destino de transferência e a Server Action falharia ao buscar um `MonthlyEntry` inexistente.

**`isEmpty` continua olhando só os lançamentos reais.** Um mês sem nenhuma conta segue mostrando o estado vazio ("Nenhum lançamento neste mês" + a dica do "Copiar mês anterior"), sem a linha da reserva — meia tela preenchida só com a reserva seria pior do que o estado vazio que já existe. Como consequência, a reserva não aparece em mês vazio; é o mesmo comportamento de hoje, e mudá-lo é assunto separado.

### Panorama (`app/(app)/panorama/page.tsx`, `lib/matrix.ts`, `CellAction.tsx`)

Um `MatrixEntry` derivado é acrescentado **para cada mês que a matriz já mostra** — a reserva não cria meses novos na visão.

`MatrixEntry.kind` e `MatrixCell.kind` ganham o valor `"budget"`. É o que faz a célula não oferecer edição de valor nem baixa: `CellAction` já ramifica por `kind`, e o ramo novo mostra o hint (`6 de 31 dias · R$ 100,00/dia`) e a explicação de que o valor cai sozinho e que o valor por dia se muda em Reservas.

Com `paid: false` e `cents: 0`, um mês passado exibe `0,00` neutro — nada a pagar, e sem o verde de "quitado", que significaria uma baixa que nunca houve.

### Dashboard (`app/(app)/dashboard/page.tsx`)

A mesma injeção em `views` cobre de uma vez os StatCards, a pizza e o ranking. O gráfico de saldo dos 12 meses monta `views` por mês num laço próprio — cada mês recebe a sua linha derivada.

Sem cadastro de `Category` para a reserva: o nome da categoria é derivado, e a pizza já cai na cor padrão (`#64748b`) quando o nome não está no mapa de cores. Criar a categoria de verdade só para ter cor a colocaria nos seletores de nova compra sem motivo.

### Reservas (`lib/planning.ts`, `app/(app)/reservas/DailyBudgetCard.tsx`)

`getNegativeMonths` passa a somar a reserva na despesa de cada mês, para o "Descoberto (meses no vermelho)" refletir o compromisso.

O texto do `DailyBudgetCard` muda: em vez de *"não entra no Total guardado nem no saldo do mês"*, passa a dizer que entra como despesa do mês e cai a cada dia que passa. Ele continua fora do "Total guardado" — aquilo é dinheiro guardado em caixinhas, outra coisa.

## Testes

- `tests/daily-budget.test.ts` — `dailyBudgetLine` em mês passado (`cents: 0`), corrente (decaindo) e futuro (mês cheio); o `hint` no formato `N de M dias · R$ X/dia`; fevereiro de 28 e 29 dias. Os casos de `dailyBudget`/`daysInMonth` que já existem ficam intactos.
- `tests/calc.test.ts` — `plannedExpense`, `plannedBalance` e `remainingToPay` com a linha derivada injetada: o total bate com a soma das linhas, e a reserva conta como não paga.
- `tests/matrix.test.ts` — uma entrada `kind: "budget"` produz célula com `remainingCents` igual ao valor e `allPaid: false`; o subtotal da categoria e `toPayByMonth` a incluem.

## Fora de escopo

- Comparar a reserva com o gasto real (exigiria categoria nas linhas do extrato do cartão, que não existe).
- Valor por dia diferente por mês, por dia da semana, ou por categoria.
- Provisionar a reserva como `MonthlyEntry` de verdade (perderia o decaimento diário).
- Corrigir a ausência de receita lançada nos meses futuros — problema real e visível nos números acima, mas independente deste trabalho.
