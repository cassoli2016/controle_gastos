# Recorrência semanal na cópia de mês + duração configurável

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** Duas queixas reais do uso (Diarista, recorrência semanal 2×/semana):

1. "Copiar mês anterior" e "Copiar mês do ano passado" não trazem a Diarista. **Causa raiz (verificada no código):** as duas actions pulam `itemId === null`, e recorrência semanal não cria `Item` — são lançamentos avulsos agrupados por `installmentId` (confirmado no banco: `itemId` nulo, um `installmentId` por grupo, `installmentSeq` nulo).
2. Não dá para lançar recorrência com horizonte diferente de 12 meses. **Causa raiz:** `createWeekdayRecurrence` usa `RECURRENCE_MONTHS = 12` fixo e o diálogo não oferece campo; na recorrência mensal o campo de parcelas fica desabilitado.

## Objetivo

A cópia de mês passa a estender recorrências semanais, e quem cria uma recorrência escolhe por quantos meses ela é provisionada.

## Parte 1 — cópia das recorrências semanais

### `lib/recurrence.ts` — dois helpers puros

```ts
/** Um grupo semanal como ele aparece no mês de origem. */
export type WeeklyGroup = {
  installmentId: string;
  description: string;
  categoryId: string | null;
  /** Valor por ocorrência, em reais (o da ocorrência mais recente do mês). */
  amount: number;
  /** Dias da semana usados no mês (0=dom … 6=sáb), ordenados. */
  weekdays: number[];
};

/**
 * Extrai os grupos semanais de um conjunto de lançamentos de um mês.
 * Marcador: sem item, sem cartão, com installmentId e SEM installmentSeq —
 * parcelamentos sempre gravam seq, então não se confundem com recorrência.
 */
export function weeklyGroupsFrom(
  entries: {
    itemId: string | null;
    cardId: string | null;
    installmentId: string | null;
    installmentSeq: number | null;
    description: string | null;
    categoryId: string | null;
    plannedAmount: unknown;
    purchaseDate: Date | null;
  }[],
): WeeklyGroup[];

/** Datas do mês (YYYY-MM) que caem nos dias da semana pedidos, em UTC. */
export function weekdayDatesInMonth(month: string, weekdays: number[]): Date[];
```

Regras de `weeklyGroupsFrom`:

- Ignora lançamento sem `purchaseDate` (sem data não há dia da semana), sem `installmentId`, com `itemId`, com `cardId` ou com `installmentSeq`.
- `weekdays`: dias distintos das ocorrências, ordenados.
- `amount`: valor da ocorrência de `purchaseDate` mais recente do grupo.
- `description`: a do grupo (todas iguais); grupo sem descrição é ignorado.

### As duas actions (`app/(app)/mes/actions.ts`)

`copyPreviousMonth` e `copyYearAgoMonthAction`, depois do laço das contas fixas (que continua idêntico), copiam os grupos semanais do mês de origem:

1. Buscam os lançamentos do mês de origem e extraem `weeklyGroupsFrom`.
2. Para cada grupo: se o mês de destino **já tem qualquer lançamento com aquele `installmentId`**, pula (cópia segue idempotente).
3. Senão, cria uma ocorrência por data de `weekdayDatesInMonth(mêsDestino, grupo.weekdays)`, com o **mesmo `installmentId`** (mantém o grupo coeso para edição/exclusão em bloco), mesma descrição, categoria e valor.
4. Cada ocorrência criada conta em `copied` — o toast de resultado já mostra a contagem.

Tudo dentro da transação que já existe.

## Parte 2 — duração da recorrência

- `lib/validators.ts`: `purchaseSchema` ganha `recurrenceMonths`, inteiro entre **2 e 60**, com **12** como padrão (campo ausente/vazio → 12). Mensagem de erro: `Duração entre 2 e 60 meses`.
- `app/(app)/mes/PurchaseDialog.tsx`: com "recorrência" marcada, aparece o campo **Duração (meses)** (`type="number"`, `min=2`, `max=60`, padrão 12), e o texto de ajuda passa a citar o valor escolhido em vez de "12 meses" fixo.
- `app/(app)/mes/actions.ts` (`createPurchase`):
  - ramo semanal → `createWeekdayRecurrence({ months: recurrenceMonths })`;
  - ramo mensal/bimestral/… → `createRecurrence({ months: Math.max(2, Math.round(recurrenceMonths / interval)) })`, mesma fórmula que hoje produz o padrão (`RECURRENCE_MONTHS / interval`), agora com a duração escolhida. `interval` é `intervalMonths` (mínimo 1).

`RECURRENCE_MONTHS = 12` continua como padrão de todos os outros chamadores.

## Testes (`tests/recurrence.test.ts`, arquivo novo)

- `weekdayDatesInMonth`: terças e sextas de um mês de 30 dias (contagem e datas exatas); mês que começa no dia da semana pedido; fevereiro bissexto; lista de dias vazia → `[]`.
- `weeklyGroupsFrom`: agrupa duas ocorrências do mesmo `installmentId` num grupo com os dois dias da semana; ignora lançamento com `itemId`; ignora parcelamento (`installmentSeq` preenchido); ignora sem `purchaseDate`; `amount` vem da ocorrência mais recente; dois grupos distintos no mesmo mês saem separados.
- `tests/validators.test.ts` (se existir; senão no arquivo novo): `purchaseSchema` aceita `recurrenceMonths` ausente (→ 12), aceita 24, rejeita 1 e 61.

Actions não têm harness de banco no projeto (convenção): o gate delas é a verificação manual descrita abaixo.

## Verificação manual (pós-deploy, dados reais)

1. Criar uma recorrência semanal de teste com duração 3 meses → confirmar 3 meses de ocorrências (e não 12).
2. Num mês seguinte ao horizonte da Diarista, usar "Copiar mês anterior" → as ocorrências semanais aparecem no mês de destino, com o mesmo grupo; rodar de novo não duplica.
3. Excluir os lançamentos de teste.

## Fora de escopo

- Campo de duração no diálogo "Lançar recebimento" e no bot do Telegram (seguem com 12 meses).
- Transformar recorrência semanal em `Item` de verdade (o modelo hoje permite um lançamento por item/mês — mudar isso é outro trabalho).
- Editar dias da semana de um grupo já criado.
