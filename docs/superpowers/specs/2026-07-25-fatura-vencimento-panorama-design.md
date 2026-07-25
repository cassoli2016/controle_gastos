# Fatura por vencimento + Panorama sempre em dia

**Data:** 2026-07-25
**Status:** Aprovado (design)
**Contexto:** Dois defeitos relatados em produção: (1) compra no Bradesco cai na fatura do mês corrente, mas essa fatura fecha no fim do mês e só é paga no mês seguinte; (2) o Panorama não reflete o pagamento de uma conta feito na tela Mês.

## Objetivo

1. A competência de qualquer cobrança no cartão (compra à vista, 1ª parcela, assinatura, pagamento antecipado) passa a ser o **mês em que a fatura vence**, calculado a partir de fechamento **e** vencimento do cartão — regra única, válida para os dois cartões.
2. O Panorama reflete pagamento parcial de células agregadas e nunca mais mostra dado velho depois de uma escrita.

## Diagnóstico

### Fatura no mês errado

`lib/fatura.ts::faturaMonth` conhece só o fechamento e assume que *a fatura que fecha no mês M é paga em M*:

```ts
if (day <= closingDay) return `${ano}-${mês}`;   // fatura "do próprio mês"
```

Isso é verdade para o Nubank (fecha 4, vence 10 — mesmo mês) e falso para o Bradesco Amazon (fecha 27, vence 10 do mês **seguinte**). Estado real do banco: `Bradesco Amazon closingDay=27`, `Nubank closingDay=4`, nenhum vencimento cadastrado.

Evidência do sintoma no banco: as duas compras `AMAZON MARKETPLACE` de 25/07/2026 estão no extrato de ago/26 e existe um consolidado `Bradesco Amazon` em jul/26 com previsto **R$ 0,00** — sobra de quando as linhas foram movidas à mão para a fatura certa.

A convenção "competência = mês do pagamento" já é a da planilha de origem: a aba `Cartão Bradesco` começa em **ago/2026**, que é a fatura que fecha em 27/07/2026.

### Panorama desatualizado

Duas causas independentes:

**(a) Célula agregada exige 100% pago.** `lib/matrix.ts` agrupa por (categoria, linha, mês) e expõe só `allPaid = todas as ocorrências pagas`. Recorrências semanais (`createWeekdayRecurrence` cria 1 lançamento por ocorrência, ligados por `installmentId`) colapsam numa célula: em jul/26, `Almoço` tem 10 ocorrências e `Diarista` 4. Pagar 5 de 10 na tela Mês não muda nada na célula — nem cor, nem valor.

**(b) Revalidação incompleta.** Das ~30 Server Actions do app, apenas `copyYearAgoMonthAction`, `setEntriesPaid` e `updateEntryValue` chamam `revalidatePath("/panorama")`. `markPaid` — o botão "Pagar" da tela Mês — revalida só `/mes`, então o Panorama continua servindo o payload antigo do Client Cache.

## Regra de roteamento de fatura

`CreditCard` ganha `dueDay Int?` (dia de vencimento, 1-31). A competência é calculada em dois passos:

| passo | regra |
|---|---|
| 1. Ciclo que captura a compra | `dia da compra ≤ fechamento` → fecha neste mês; senão → fecha no mês seguinte |
| 2. Mês do vencimento desse ciclo | `vencimento > fechamento` → mesmo mês do fechamento; `vencimento ≤ fechamento` → mês seguinte |

O resultado do passo 2 é a competência (`MonthlyEntry.month`).

```
Bradesco Amazon (fecha 27 · vence 10):
  compra 25/07/26 → fecha 27/07 → vence 10/08 → ago/26   (hoje: jul/26 ✗)
  compra 27/07/26 → fecha 27/07 → vence 10/08 → ago/26
  compra 28/07/26 → fecha 27/08 → vence 10/09 → set/26
  compra 28/12/26 → fecha 27/01 → vence 10/02 → fev/27   (virada de ano)

Nubank (fecha 4 · vence 10):
  compra 03/07/26 → fecha 04/07 → vence 10/07 → jul/26   (= comportamento atual)
  compra 25/07/26 → fecha 04/08 → vence 10/08 → ago/26   (= comportamento atual)
```

Equivalência com o comportamento atual: quando `vencimento > fechamento` o resultado é idêntico ao de hoje; quando `vencimento ≤ fechamento` é o de hoje **+ 1 mês**. Logo a mudança é retrocompatível para o Nubank e corrige o Bradesco.

**Fallbacks preservados:** cartão sem `closingDay` continua caindo no `fallbackMonth` informado pelo chamador; cartão com `closingDay` e **sem** `dueDay` mantém exatamente o comportamento atual (nada quebra para cartões que ainda não têm o campo preenchido).

`dueDay == closingDay` conta como "mês seguinte" (uma fatura não fecha e vence no mesmo dia).

## Modelo

```prisma
model CreditCard {
  closingDay Int?  // já existe
  dueDay     Int?  // NOVO: dia do vencimento (1-31); define em que mês a fatura é paga
}
```

Migration aditiva + backfill dos dois cartões existentes para `dueDay = 10` (valor informado pelo usuário para ambos). `UPDATE` em tabela vazia é no-op, então bancos novos e o schema `e2e` não são afetados.

## Camada de domínio

- **`lib/fatura.ts`** — `faturaMonth(dateISO, closingDay, dueDay?)` ganha o 3º parâmetro opcional e implementa os dois passos. `cardTargetMonth(card, dateISO, fallbackMonth)` passa a ler `card.dueDay`. Como todo roteamento do app já passa por `cardTargetMonth`, a correção alcança de uma vez: compra pela UI (`mes/actions.ts::createPurchase`), bot do Telegram (texto, SMS Bradesco, share Nubank, CSV de fatura), `addPrepaymentToCard` e `firstChargeFaturaMonth` (assinaturas).
- **`lib/card-entry.ts`** — `CardRef` ganha `dueDay: number | null`. O tipo é construído explicitamente em ~8 pontos; o compilador aponta cada um (completude verificada pelo type-check, não por inspeção).
- **`lib/card-entry.ts::upsertCardEntry`** — quando o total do mês chega a **zero**, não sobra nenhuma `CardTransaction` naquele cartão/mês e o consolidado **não está pago**, o `MonthlyEntry` é excluído em vez de ficar como linha zerada no Panorama. Fatura que zera por estorno (compra + devolução) mantém o consolidado, porque as transações continuam lá.
- **`lib/matrix.ts`** — `MatrixCell` ganha `paidCount: number`. `allPaid` continua existindo (é o caso `paidCount === count`).
- **`lib/revalidate.ts`** (novo) — `revalidateFinance()` = `revalidatePath("/", "layout")`, que purga o Client Cache inteiro. Substitui as listas de caminhos de todas as Server Actions e do webhook do Telegram. Todas as páginas leem do banco a cada request (nenhuma é estática), então não há cache de página sendo desperdiçado — o custo é um refetch de RSC na próxima navegação, e em troca a classe de bug "esqueci de listar uma tela" desaparece.
- **`lib/validators.ts`** — `cardSchema` ganha `dueDay` com o mesmo `preprocess` de `closingDay` (campo vazio → `null`, 1..31).

## Telas / UX

- **Cartões** — formulário de novo cartão e de edição (`CardRow`) ganham "Dia de vencimento da fatura (opcional)", com a explicação: *vencimento antes do fechamento significa que a fatura é paga no mês seguinte*. O badge passa de "Fecha dia 27" para "Fecha 27 · vence 10" (só "Fecha 27" quando não há vencimento).
- **Mês** — a linha do consolidado do cartão passa a mostrar o dia do vencimento na coluna "Dia" (hoje mostra "—"): `dueDay` do item, senão do cartão.
- **Panorama** — a célula tem três estados: nenhuma ocorrência paga (normal), **parcial** (âmbar, com a contagem `5/10` ao lado do valor), todas pagas (verde). A contagem aparece só quando a célula tem mais de uma ocorrência e está parcial. O popover mostra "10 ocorrências · 5 pagas". O texto de ajuda do topo passa a mencionar o âmbar.

## Limpeza de dados (one-off)

Script `scripts/fix-fatura-jul.ts`, idempotente e com relatório no stdout:

1. Exclui o consolidado `Bradesco Amazon` de jul/26 com previsto 0 (a regra nova de `upsertCardEntry` evita que reapareça).
2. Exclui as 63 `CardTransaction` do Nubank em jul/26 — todas com `purchaseDate = 2026-07-05`, todas com descrição+valor idênticos a linhas de ago/26, nenhuma marcada como `prepayment`, e sem nenhum consolidado correspondente. Hoje fazem a tela Cartões de julho exibir "Fatura do mês R$ 0,00" com 63 linhas embaixo. O script casa por (descrição, valor) contra ago/26 e só apaga o que tem par — se algo não casar, aborta e relata.

## Testes

- `tests/fatura.test.ts` — os casos dos dois cartões reais: Bradesco (fecha 27 · vence 10) antes/no/depois do fechamento e virada de ano; Nubank (fecha 4 · vence 10) confirmando que o resultado não mudou; `dueDay` nulo mantendo o comportamento antigo; `dueDay == closingDay` caindo no mês seguinte. Os casos existentes permanecem intactos.
- `tests/matrix.test.ts` — célula com 10 ocorrências e 5 pagas → `paidCount = 5`, `allPaid = false`; todas pagas → `allPaid = true`; nenhuma paga → `paidCount = 0`.
- `tests/card-subscription.test.ts` — `firstChargeFaturaMonth` com vencimento antes do fechamento.
- `tests/card-entry.test.ts` — a decisão de apagar o consolidado zerado foi extraída para o predicado puro `shouldDropZeroedCardEntry` (sem dependência do Prisma) e é coberta por 5 casos unitários. Cobertura e2e desse cenário fica como follow-up: `scripts/e2e-reset-db.ts` não semeia nenhum `CreditCard` nem `CardTransaction`, então não há hoje um teste e2e que monte o estado (fatura zerada, sem extrato) necessário para exercitar essa exclusão.

## Fora de escopo

- Data de vencimento como lançamento próprio / agenda de pagamento da fatura.
- Reroteamento retroativo de compras antigas: só as duas do Bradesco de 25/07 estavam mal roteadas e já foram movidas à mão; o resto do extrato veio da planilha, sem data de compra.
- Pagamento antecipado feito **depois** do fechamento e antes do vencimento continua sendo aplicado à próxima fatura em aberto (comportamento atual, mesma ambiguidade de antes).
