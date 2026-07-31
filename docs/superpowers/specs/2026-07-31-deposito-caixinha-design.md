# Depositar na caixinha de reserva

**Data:** 2026-07-31
**Status:** Aprovado (design)
**Contexto:** O fluxo real do usuário é: a receita do mês paga tudo e **a sobra vai para a caixinha de reserva**. Hoje isso é feito editando o valor da caixinha na mão, o que faz o dinheiro contar duas vezes enquanto o mês está na janela da projeção: uma no saldo do mês (que o Patrimônio projetado acumula) e outra no Total guardado (ponto de partida da projeção).

## Objetivo

Uma ação **Depositar** na caixinha que registra o movimento nas duas pontas ao mesmo tempo — soma na caixinha e desconta do saldo do mês — para que, em qualquer instante, o dinheiro esteja **ou** no mês **ou** na caixinha, nunca nos dois.

## Decisões do brainstorming

- **Depósito como despesa do mês** (abordagem A). O lançamento entra em todas as somas, como a "Reserva do dia a dia" já entra ([2026-07-26-reserva-como-despesa-design.md](2026-07-26-reserva-como-despesa-design.md)) — nenhuma tela precisa de caso especial. A alternativa de um terceiro tipo "Transferência" (fora de Despesas, dentro do saldo) foi descartada: tocaria em todos os cálculos, telas e testes por um ganho só estético.
- **Só depositar por enquanto.** Retirada (caixinha → mês, como receita) fica para depois; se precisar, o usuário edita a caixinha na mão como hoje.
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

### `lib/reserve-deposit.ts`

A montagem dos dados do lançamento sai para um helper puro, testável sem banco:

```ts
/** Categoria dos depósitos em caixinha (find-or-create na action). */
export const RESERVE_CATEGORY = { name: "Reserva", type: "EXPENSE", color: "#14b8a6" };

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
```

A action fica com o que é inerentemente dela: validação, find-or-create da categoria, transação e revalidate.

## Efeito nas telas — sem código novo nelas

Por ser um `MonthlyEntry` comum de despesa, tudo fecha sozinho:

- **Mês**: linha paga na categoria "Reserva"; editável e excluível como qualquer lançamento (excluir o lançamento **não** desfaz o valor na caixinha — são registros independentes, como a edição manual).
- **Panorama, pizza e ranking do Dashboard**: incluem a linha normalmente.
- **Patrimônio projetado**: o Total guardado sobe exatamente o que o saldo do mês desce — soma inalterada no ato do depósito; o dinheiro conta uma vez.

Efeito colateral aceito: "Reserva" vira `Category` de verdade e aparece nos seletores de categoria de compra, como "Cartão/Compras" e "Recebimentos". (A "Reserva do dia a dia" continua sendo linha derivada, sem categoria no banco — são coisas distintas e com nomes distintos.)

## Testes

- `tests/reserve-deposit.test.ts` — `depositEntryData`: competência derivada da data (inclusive virada de ano), `paid: true` com `paidAmount` = `plannedAmount`, descrição `Depósito · <nome>`, datas em UTC (`T00:00:00Z`, convenção do projeto).
- Verificação visual no app (loop de screenshots Playwright): depósito feito → linha no Mês, caixinha maior, patrimônio inalterado no dia.

## Fora de escopo

- Retirada da caixinha (o inverso, como receita do mês).
- Depósito pelo bot do Telegram.
- Sugerir automaticamente a sobra do mês como valor do depósito.
- Histórico de depósitos por caixinha (não há tabela de transações de reserva; `ReserveBox` segue só com `amount`).
