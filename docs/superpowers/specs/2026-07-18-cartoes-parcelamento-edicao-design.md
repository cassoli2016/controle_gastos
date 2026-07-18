# Fase A — Cartões, Parcelamento e Edição de Lançamentos

**Data:** 2026-07-18
**Status:** Aprovado (design)
**Contexto:** Evolução do app para gerenciador financeiro estilo banco (ver memória `vision-financial-manager`). Primeira fase do roadmap. Não quebra o domínio de Contas Fixas existente.

## Objetivo

Permitir cartões de crédito (2+), lançar compras por cartão "conforme gasta", **parcelamento que gera automaticamente os N lançamentos** nos meses seguintes, e **editar/excluir** lançamentos e parcelamentos inteiros. Escopo simples de cartão (sem fatura/fechamento).

## Decisões (brainstorming)

- Cartões simples (nome, cor) — sem data de fechamento/vencimento/fatura.
- Compra parcelada: **valor por parcela** + nº de parcelas + mês inicial (default mês atual) → cria N lançamentos.
- Compra avulsa pode ter cartão (opcional) e categoria (opcional → default categoria semeada **"Cartão/Compras"**, EXPENSE).
- Edição: por lançamento (valor/pago/excluir) e por parcelamento (editar parcelas em aberto / excluir série).

## Modelo (migração aditiva — não quebra nada)

**Nova entidade `CreditCard`:** `id, name, color, active, createdAt`.

**`MonthlyEntry` ganha campos opcionais:**
- `itemId` passa a ser **opcional** (compra avulsa não tem item). Postgres trata NULL como distinto no `@@unique([itemId, month])`, então várias entradas avulsas por mês coexistem e o upsert por item continua único.
- `description String?` — rótulo quando não há item.
- `categoryId String?` — categoria quando não há item (entradas de item herdam de `item.category`).
- `cardId String?` — cartão da compra (relação com `CreditCard`, `onDelete: SetNull`).
- `installmentId String?`, `installmentSeq Int?`, `installmentCount Int?` — liga as parcelas de uma compra e exibe "X/N".

Um lançamento é, portanto, (a) conta fixa (item) OU (b) avulso/cartão (description + categoryId + cardId? + parcelamento). Ambos entram na mesma visão mensal, agrupados por categoria.

Semear uma categoria **"Cartão/Compras"** (EXPENSE) se não existir.

## Camada de domínio

- `lib/entries.ts` (`toEntryView`/DisplayRow): derivar `itemName`←`item.name ?? description`, `categoryName/type`←`item.category ?? category` (via categoryId), e carregar `cardId`, `installmentId/seq/count`, `description`. `groupByCategory` inalterado (opera sobre categoryName/type).
- `lib/installments.ts` (novo, testável): dado `startMonth` (YYYY-MM) + `count`, retorna a lista de meses (reusa `monthRange`/`monthStringFromDate`) — base para gerar as parcelas.
- `lib/validators.ts`: `cardSchema` (name, color), `purchaseSchema` (cardId?, description, categoryId?, amount, installments 1..N, startMonth YYYY-MM).

## Server Actions (novas; não alteram as existentes)

- Cartões: `createCard/updateCard/archiveCard` (assinatura `(prevState, formData) => ActionState`).
- `createPurchase(prevState, formData)` — cria N `MonthlyEntry` numa transação: mesmo `installmentId` (cuid), `seq` 1..N, `count`=N, `description`, `categoryId` (ou "Cartão/Compras"), `cardId?`, `plannedAmount` = valor da parcela, meses = startMonth..+N-1. `revalidatePath`.
- `deleteEntry(prevState, formData)` — exclui um lançamento (id do formData).
- `updateInstallment(prevState, formData)` — atualiza `plannedAmount` das parcelas **em aberto** (não pagas) de um `installmentId`.
- `deleteInstallment(prevState, formData)` — exclui todas as parcelas de um `installmentId`.

## Telas / UX

- **Cartões (`/cartoes`)** — item novo na navegação. CRUD de cartões (chip de cor + nome), estilo shadcn (Table/cards, Dialog criar/editar, AlertDialog arquivar). Por cartão, mostrar o **total do mês** e a lista de compras (fatura-lite), com seletor de mês (MonthNav).
- **Lançar compra / parcelamento** — Dialog (acessível na tela do Mês e na de Cartões): Cartão (opcional), Descrição, Categoria (opcional), Valor da parcela (`CurrencyInput`), Nº de parcelas, Mês inicial. Toast "Compra em N parcelas lançada".
- **Mês** — lançamentos avulsos/cartão aparecem agrupados por categoria com: rótulo = descrição, badge do cartão + "X/N", e ações: excluir lançamento (AlertDialog), editar/excluir parcelamento. Edição de valor/pago reutiliza `PlannedCell`/`PayCell`.
- Toasts em toda ação; tudo tema-aware claro/escuro (base das Fases 1–3).

## Fora de escopo (Fase A)

- Fatura/data de fechamento/vencimento dos cartões (escopo simples escolhido).
- Reajuste anual por conta / reserva (Fase B).
- Limite de cartão, relatórios por cartão além do total do mês.

## Testes

- Vitest: `lib/installments.ts` (geração de meses a partir de start+count), `purchaseSchema`/`cardSchema` (validators), e o mapeamento `toEntryView` para entradas avulsas (label/categoria a partir de description/categoryId).
- UI/fluxo logado: teste manual (e2e ainda adiado).

## Fases seguintes (roadmap)

- **Fase B:** provisionamento com reajuste anual por conta (% ou valor a cada 12 meses) + reserva.
- **Fase C:** polish visual contínuo estilo banco.
