# Caixinha de reserva: depositar e pagar contas com ela

**Data:** 2026-07-31
**Status:** Aprovado (design)
**Contexto:** O fluxo real do usuário é: a receita do mês entra, às vezes **vai inteira para a caixinha de reserva**, e as contas são pagas ora com o dinheiro do mês, ora com o da caixinha. Hoje isso é feito editando o valor da caixinha na mão, o que faz o dinheiro contar duas vezes enquanto o mês está na janela da projeção: uma no saldo do mês (que o Patrimônio projetado acumula) e outra no Total guardado (ponto de partida da projeção).

## Objetivo

Registrar cada movimento nas duas pontas ao mesmo tempo, para que, em qualquer instante, o dinheiro esteja **ou** no mês **ou** na caixinha, nunca nos dois:

- **Depositar**: soma na caixinha e desconta do saldo do mês.
- **Pagar conta com a caixinha**: na baixa, o valor sai da caixinha e uma **retirada** compensa no mês — sem isso a conta sairia duas vezes do patrimônio (a despesa já desconta o saldo do mês; a caixinha diminuir também descontaria de novo).

## Decisões do brainstorming

- **Depósito como despesa do mês** (abordagem A). O lançamento entra em todas as somas, como a "Reserva do dia a dia" já entra ([2026-07-26-reserva-como-despesa-design.md](2026-07-26-reserva-como-despesa-design.md)) — nenhuma tela precisa de caso especial. A alternativa de um terceiro tipo "Transferência" (fora de Despesas, dentro do saldo) foi descartada: tocaria em todos os cálculos, telas e testes por um ganho só estético.
- **Retirada só acoplada ao pagamento.** Não há botão "Retirar" avulso na caixinha; a retirada nasce ao pagar uma conta escolhendo a caixinha como origem do dinheiro. Retirada avulsa fica para quando houver necessidade real.
- **A edição manual da caixinha continua existindo** — é o caminho para correções e rendimento, que não devem passar pelo mês.

## Comportamento

Na tela Reservas, cada `ReserveCard` ganha um botão **Depositar** (ao lado de editar/excluir) que abre um diálogo com:

- **Valor** (`CurrencyInput`, obrigatório, > 0);
- **Data** (padrão: hoje). O mês da data é a competência do lançamento.

Ao confirmar, a Server Action `depositToReserve` (em `app/(app)/reservas/actions.ts`, com `guardAction`) valida com o schema novo `depositSchema` (id da caixinha, valor em reais como no `purchaseSchema`, data `YYYY-MM-DD`) e executa numa `prisma.$transaction`:

1. `reserveBox.update` somando o valor ao `amount`;
2. `monthlyEntry.create` com:
   - categoria **"Reserva"** (`EXPENSE`, cor `#14b8a6`) — find-or-create no padrão de `resolveIncomeCategoryId`/`resolveDefaultPurchaseCategoryId`;
   - `description`: `Depósito · <nome da caixinha>`;
   - `month`: mês da data; `purchaseDate`: a data;
   - `plannedAmount`: o valor;
   - **já pago**: `paid: true`, `paidAmount` igual ao valor, `paidDate` igual à data — o dinheiro já saiu, então não entra em "restante a pagar".

Depois, `revalidateFinance()`. Caixinha inexistente → erro amigável. O diálogo fecha no sucesso e mostra toast ("Depósito registrado."), no mesmo padrão do editar.

## Pagar uma conta com a caixinha

O popover **Pagar** do `PayCell` (tela Mês, só despesas — "Receber" não muda) ganha um select **"De onde sai o dinheiro?"**: "Do mês" (padrão) + uma opção por caixinha. A lista de caixinhas desce do server component da página.

`markPaid` aceita o campo opcional `reserveId`. Quando presente (e `paid: true`), a action valida que a caixinha tem saldo suficiente (**valor pago ≤ saldo da caixinha**; senão, erro "Saldo insuficiente na caixinha") e executa numa `prisma.$transaction`:

1. a baixa de hoje (`paid`, `paidAmount`, `paidDate`);
2. `reserveBox.update` subtraindo o **valor pago** do `amount`;
3. `monthlyEntry.create` da retirada: categoria **"Retirada da reserva"** (`INCOME`, cor `#14b8a6`, find-or-create), descrição `Retirada · <nome da caixinha>`, **competência = mês da conta paga** (o par despesa/retirada se cancela no mesmo mês), `purchaseDate` = data do pagamento, e já recebida (`paid: true`, `paidAmount` = valor, `paidDate` = data do pagamento).

Sem `reserveId`, a baixa funciona exatamente como hoje.

**Desmarcar não desfaz a retirada.** Mesmo princípio da independência entre lançamento e caixinha no depósito: ao desmarcar um pagamento feito pela caixinha, a linha "Retirada" fica no mês (excluível como qualquer lançamento) e o valor da caixinha se corrige na mão. Ligar os dois registros exigiria coluna nova no schema por um caso raro.

### Verificação da contabilidade (conta de padaria)

Receita 10.000 depositada inteira na caixinha; conta de 500 paga pela caixinha:

| Movimento | Saldo do mês | Caixinha | Patrimônio |
|---|---|---|---|
| Receita lançada | +10.000 | 0 | +10.000 |
| Depósito | +10.000 −10.000 = 0 | +10.000 | +10.000 |
| Conta de 500 lançada | −500 | 10.000 | +9.500 |
| Baixa pela caixinha | −500 +500 (retirada) = 0 | 9.500 | +9.500 ✓ |

Se o valor pago diferir do previsto, a retirada usa o **valor pago** — é o que de fato saiu da caixinha.

### `lib/reserve-flow.ts`

A montagem dos dados dos lançamentos sai para helpers puros, testáveis sem banco:

```ts
/** Categorias dos movimentos de caixinha (find-or-create nas actions). */
export const RESERVE_CATEGORY = { name: "Reserva", type: "EXPENSE", color: "#14b8a6" };
export const RESERVE_WITHDRAWAL_CATEGORY = { name: "Retirada da reserva", type: "INCOME", color: "#14b8a6" };

/** Dados do MonthlyEntry de um depósito: competência = mês da data, já pago. */
export function depositEntryData(reserveName: string, amount: number, dateISO: string): {
  description: string;   // "Depósito · <nome>"
  month: Date;           // monthToDate(dateISO.slice(0, 7))
  purchaseDate: Date;
  plannedAmount: number; // reais
  paid: true;
  paidAmount: number;
  paidDate: Date;
};

/** Dados do MonthlyEntry de uma retirada: competência = mês da CONTA paga, já recebida. */
export function withdrawalEntryData(reserveName: string, amount: number, entryMonth: Date, paidDateISO: string): {
  description: string;   // "Retirada · <nome>"
  month: Date;           // o mês da conta, não o da data
  purchaseDate: Date;    // data do pagamento
  plannedAmount: number;
  paid: true;
  paidAmount: number;
  paidDate: Date;
};
```

As actions ficam com o que é inerentemente delas: validação, find-or-create da categoria, transação e revalidate.

## Efeito nas telas — sem código novo além do select no PayCell

Por serem `MonthlyEntry` comuns (despesa no depósito, receita na retirada), tudo fecha sozinho:

- **Mês**: linhas pagas nas categorias "Reserva"/"Retirada da reserva"; editáveis e excluíveis como qualquer lançamento (excluir o lançamento **não** desfaz o valor na caixinha — são registros independentes, como a edição manual).
- **Panorama, pizza e ranking do Dashboard**: incluem as linhas normalmente.
- **Patrimônio projetado**: cada movimento mexe nas duas pontas em sentidos opostos — a soma não muda no ato, e o dinheiro conta uma vez (tabela acima).

Efeito colateral aceito: "Reserva" e "Retirada da reserva" viram `Category` de verdade e aparecem nos seletores, como "Cartão/Compras" e "Recebimentos". (A "Reserva do dia a dia" continua sendo linha derivada, sem categoria no banco — são coisas distintas e com nomes distintos.)

## Testes

- `tests/reserve-flow.test.ts` —
  - `depositEntryData`: competência derivada da data (inclusive virada de ano), `paid: true` com `paidAmount` = `plannedAmount`, descrição `Depósito · <nome>`, datas em UTC (`T00:00:00Z`, convenção do projeto);
  - `withdrawalEntryData`: competência = mês da conta (não o da data do pagamento), descrição `Retirada · <nome>`, já recebida com o valor pago.
- Verificação visual no app (loop de screenshots Playwright): depósito feito → linha no Mês, caixinha maior, patrimônio inalterado no dia; conta paga pela caixinha → baixa + linha de retirada, caixinha menor, patrimônio inalterado no ato.

## Fora de escopo

- Retirada avulsa (sem pagamento de conta) — a caixinha se edita na mão, como hoje.
- Pagar pela caixinha na baixa em lote (Panorama/`setEntriesPaid` e "marcar todos" do Mês) — essas quitações continuam saindo "do mês".
- Depósito ou pagamento pelo bot do Telegram.
- Sugerir automaticamente a sobra do mês como valor do depósito.
- Histórico de movimentos por caixinha (não há tabela de transações de reserva; `ReserveBox` segue só com `amount`).
- Desfazer retirada/caixinha automaticamente ao desmarcar um pagamento (exigiria ligar os registros no schema).
