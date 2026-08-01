# Lote de higiene: data local, duração no recebimento, retirada avulsa, diálogo sticky

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** Quatro pendências acumuladas nas revisões desta semana, escolhidas pelo usuário como lote único. Um quinto item (índice único parcial para a cópia semanal) foi **cortado por decisão conjunta**: o Prisma não expressa índice parcial no schema, então ele viveria só numa migration manual e a próxima migration gerada o apagaria silenciosamente; o risco de corrida que ele evita exige dois envios no mesmo milissegundo num app de um usuário. Fica registrado como conhecido.

## 1. Data padrão dos diálogos usa UTC

**Problema:** sete campos de data usam `new Date().toISOString().slice(0, 10)`. Em São Paulo (UTC−3), das 21h à meia-noite isso devolve **o dia seguinte** — quem lança uma compra à noite recebe a data errada por padrão.

**Correção:** usar `todayISOInSaoPaulo()` (`lib/fatura.ts`), que já existe, é puro (só depende de `Intl`, funciona no browser) e é usado no servidor. Locais:

- `app/(app)/mes/PayCell.tsx` (helper local `todayISO` e o fallback de `toDateInputValue`)
- `app/(app)/mes/PurchaseDialog.tsx`
- `app/(app)/mes/IncomeDialog.tsx`
- `app/(app)/reservas/ReserveCard.tsx` (helper local `todayISO`)
- `app/(app)/cartoes/PrepaymentDialog.tsx`
- `app/(app)/investimentos/TradeDialog.tsx`

Os helpers locais `todayISO` de `PayCell` e `ReserveCard` somem (viram chamada direta).

**Cuidado:** `toDateInputValue(d: Date)` em `PayCell` formata uma data JÁ gravada (`paidDate`, meia-noite UTC) — essa conversão continua com `toISOString()`, que é o certo para um valor UTC. Só o **fallback** ("não tem data ainda") passa a usar a data de São Paulo.

## 2. Duração da recorrência no "Lançar recebimento"

O diálogo de compra ganhou hoje o campo Duração (2–60, padrão 12); o de recebimento ficou com 12 fixos.

- `lib/validators.ts`: `incomeSchema` ganha `recurrenceMonths` idêntico ao do `purchaseSchema` (preprocess vazio/ausente → 12; inteiro 2..60; erro `Duração entre 2 e 60 meses`).
- `app/(app)/mes/actions.ts` (`createIncome`): passa `months: Math.max(2, Math.round(recurrenceMonths / interval))` ao `createRecurrence`, com `interval = Math.max(1, intervalMonths)` — mesma conversão da compra. Os demais argumentos (inclusive `businessDay`) ficam como estão.
- `app/(app)/mes/IncomeDialog.tsx`: campo **Duração (meses)** quando a recorrência está marcada, com o mesmo texto de ajuda da compra.

## 3. Retirada avulsa da caixinha

Hoje só existe retirada acoplada ao pagamento de uma conta. Falta o caso "tirei da caixinha para usar" sem uma conta específica.

- `app/(app)/reservas/actions.ts`: nova action `withdrawFromReserve`, espelho de `depositToReserve`. Valida com `withdrawalSchema` (mesma forma do `depositSchema`: `id`, `amount` > 0, `date`), recusa **saldo insuficiente** (`Saldo insuficiente na caixinha.`), e numa `prisma.$transaction`: decrementa `ReserveBox.amount` e cria o `MonthlyEntry` de `withdrawalEntryData(box.name, amount, monthToDate(date.slice(0, 7)), date)` na categoria `Retirada da reserva` (find-or-create por `resolveCategoryId`).
- `app/(app)/reservas/ReserveCard.tsx`: botão **Retirar** (ícone `Minus`, `aria-label` `Retirar de <caixinha>`) ao lado de Depositar, abrindo diálogo com Valor e Data; toast `Retirada registrada.`.
- A competência é o **mês da data escolhida** (não há conta para ancorar, diferente da retirada por pagamento).

## 4. Cabeçalho e rodapé fixos no diálogo rolável

`DialogContent` ganhou hoje `max-h`+`overflow-y-auto`; em formulários altos o título e o botão de enviar rolam junto.

- `components/ui/dialog.tsx`: `DialogHeader` recebe `sticky top-0 z-10 bg-popover`; `DialogFooter` recebe `sticky bottom-0 z-10 bg-popover`. Ambos mantêm o `className` de override vencendo (`cn` com twMerge, como já é).

## Testes

- `tests/validators.test.ts`: `incomeSchema` sem `recurrenceMonths` → 12; com `"24"` → 24; `"1"` e `"61"` rejeitados.
- Não há harness de banco para actions (convenção): `withdrawFromReserve` é validada na verificação manual.
- Gate: suíte completa, `tsc`, lint, build e e2e verdes; verificação visual dos diálogos (data padrão correta à noite é conferida por inspeção do valor renderizado, não por relógio).

## Fora de escopo

- Índice único parcial da cópia semanal (cortado, motivo acima).
- Duração da recorrência no bot do Telegram.
- Aviso ao desmarcar pagamento feito pela caixinha.
