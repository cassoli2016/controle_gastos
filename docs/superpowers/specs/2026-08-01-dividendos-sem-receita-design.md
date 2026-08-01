# Dividendos não entram como receita do mês

**Data:** 2026-08-01
**Status:** Aprovado (design)
**Contexto:** O usuário reinveste 100% dos proventos. Hoje, marcar um provento como recebido (tela Investimentos) ou importar o relatório da B3 cria uma `MonthlyEntry` de receita "Dividendos" já paga no mês do pagamento — dinheiro que nunca passa pelo orçamento do mês infla receitas, saldo e patrimônio projetado. O valor reinvestido já conta uma vez, dentro da carteira (mesmo princípio das caixinhas: dinheiro conta num lugar só).

## Objetivo

O controle de proventos (pendente/recebido, totais, histórico) continua inteiro na tela Investimentos — mas **nenhum lançamento mensal** nasce de dividendos. Receita do mês volta a ser só o que entra de fato no orçamento.

## Decisões do brainstorming

- **Remover o lançamento mensal de vez** (não criar categoria especial excluída das somas, nem flag "reinvisto" configurável — YAGNI; se um dia um provento for sacado, o caminho manual "Lançar recebimento" continua existindo).
- **Apagar o histórico já lançado**: as receitas "Dividendos" de meses passados saem; os saldos antigos caem o valor dos proventos. Escolha explícita do usuário.
- **Sem migração de schema**: `Dividend.entryId` fica no banco como coluna legada (o pipeline de migração em produção é manual); o schema ganha comentário de depreciação. Nenhum código novo a lê ou escreve.

## Mudanças

### `app/(app)/investimentos/actions.ts` — `toggleDividendReceived`

Passa a só alternar `received` (true ⇄ false). Sai: `createDividendMonthlyEntry`, a escrita de `entryId` e o `deleteMany` do lançamento ao desmarcar. `deleteDividend` perde o `deleteMany` do lançamento vinculado. Docstrings atualizadas.

### `lib/b3-import.ts`

O bloco "Fluxo do mês: só do mês corrente em diante" sai por inteiro (a criação do lançamento e a escrita de `entryId`). O contador `monthEntries` sai do tipo de resultado e de qualquer texto que o exiba (toast/resumo da importação).

### `lib/dividend-entry.ts`

Arquivo removido (`resolveDividendCategoryId` e `createDividendMonthlyEntry` ficam sem usos).

### `prisma/schema.prisma`

Comentário em `Dividend.entryId`: legado, não usado desde 2026-08-01 (lançamento mensal de dividendos removido); coluna mantida para evitar migração.

### Textos

- `DividendControls.tsx`: toast "Provento recebido — lançado no mês. 💰" → algo como "Provento marcado como recebido. 💰"; docstrings dos botões deixam de falar em "fluxo do mês".
- `IncomeDialog.tsx` (tela Mês): a ajuda deixa de sugerir "dividendos" como exemplo de recebimento manual.

### Limpeza única do histórico — `scripts/fix-dividendos-receitas.ts`

Na convenção dos `scripts/fix-*.ts` (roda uma vez, fica arquivado):

1. Apaga toda `MonthlyEntry` cujo id esteja em `Dividend.entryId`.
2. Zera `entryId` de todos os `Dividend`.
3. Se a categoria "Dividendos" ficar sem nenhum lançamento e sem itens, apaga a categoria (sai dos seletores).
4. Loga o que apagou (contagem e soma em reais).

## Efeito nas telas

Nenhum código de soma muda: as receitas de dividendos simplesmente deixam de existir como `MonthlyEntry`. Meses antigos mostram receitas/saldos menores (esperado e escolhido); patrimônio projetado deixa de somar duas vezes o provento reinvestido (carteira + receita do mês). A tela Investimentos não muda de comportamento visível além dos textos — recebido/pendente, totais por ativo e por ano continuam.

### Bot do Telegram (consumidor do `monthEntries`)

`app/api/telegram/route.ts:190` monta a linha "📅 N lançados no fluxo do mês" no resumo da importação B3 — sai junto com o contador.

## Testes

- Não há testes de actions no projeto (convenção); a mudança é remoção de efeito colateral.
- Os testes existentes (`b3-report.test.ts`, `csv-import.test.ts`, `import-normalize.test.ts`) não cobrem `monthEntries` — se a remoção do campo quebrar algum tipo, o `tsc` acusa.
- Gate: suíte completa + e2e existentes verdes; verificação manual de que marcar/desmarcar provento não cria nem apaga lançamento (checagem no banco antes/depois, no ambiente e2e ou dev).

## Fora de escopo

- Migração para remover a coluna `Dividend.entryId`.
- Registrar automaticamente a recompra (reinvestimento) na carteira a partir do provento.
- Mudanças no bot do Telegram além da linha do resumo da importação B3 (o comando que lista proventos pendentes continua como está).
