# Fase 4 Final — Orçamento por Categoria, Patrimônio Projetado e Ajuda do Bot

**Data:** 2026-07-30 · Aprovado pelo usuário ("Pode fazer tudo e estruturar melhor a ajuda
do Telegram"). Fecha o ciclo de melhorias iniciado hoje. Dois PRs.

## PR A — Orçamento por categoria (4b)

- Schema: `Category.budgetAmount Decimal? @db.Decimal(12, 2)` — migration `category_budget`
  (nullable, aditiva). Meta MENSAL de gasto da categoria; null = sem meta.
- UI Categorias: campo "Meta mensal (opcional)" com `CurrencyInput` no Nova categoria e no
  editar (`CategoryRow`); actions repassam `budgetAmount` (mesmo padrão do limite do cartão).
- `lib/budget.ts` (puro, testado): `budgetLines(views: EntryView[], categories: {id, name,
  color, budgetCents}[]) → { categoryId, name, color, budgetCents, plannedCents, paidCents,
  pct }[]` — só categorias com meta > 0; `plannedCents` = despesas planejadas da categoria
  no mês; `paidCents` = parte paga; `pct = progressPct(planned, budget)`; ordena por pct
  desc. Reuso de `usageTone` (verde <60 / âmbar <85 / vermelho ≥85) para a cor da barra.
- Dashboard: card "Orçamento do mês" (grade 2×2, após Próximas faturas) listando cada
  categoria com meta: nome, barra colorida, "R$ planejado de R$ meta · R$ pago". Sem
  nenhuma meta cadastrada: hint + link para /categorias. Usa PLANEJADO vs meta (mostra
  estouro antes de acontecer); pago aparece na sub-linha.

## PR B — Patrimônio projetado (4c) + ajuda do Telegram

- `lib/patrimony.ts` (puro, testado): `accumulateBalance(startCents, points: { month:
  string; balanceCents: number }[]) → { month, totalCents }[]` — soma acumulada partindo
  do patrimônio atual.
- Dashboard: card "Patrimônio projetado (12 meses) — estimado" com gráfico de área/linha
  (recharts, novo `components/charts/PatrimonyChart.tsx`, mesmo estilo do MonthlyBalance).
  Ponto de partida = reservas totais + valor atual da carteira (dados já buscados na
  página); cada mês soma o `balanceCents` do `balanceData` existente. Rótulo deixa claro
  que investimentos flutuam.
- Telegram:
  - `reply()` ganha `opts?: { html?: boolean }` → `parse_mode: "HTML"` SÓ quando pedido
    (mensagens com texto do usuário continuam texto puro — sem risco de HTML inválido).
  - HELP reestruturado em seções com `<b>títulos</b>` e linhas curtas: 💸 Gastos ·
    💰 Recebimentos · 💳 Cartões · 🔁 Recorrências · 📈 Investimentos · 📎 Arquivos e fotos
    (inclui a foto de comprovante). Conteúdo atual preservado, só reorganizado.
  - Comando de ajuda: texto "ajuda", "/ajuda", "help" ou "/help" (case-insensitive)
    responde o HELP diretamente (hoje a ajuda só aparece quando o parse falha).

## Testes

- `budgetLines`: categorias sem meta ficam de fora; planejado/pago por categoria; ordenação.
- `accumulateBalance`: acumulação com saldos negativos e positivos; vazio → só o início? —
  vazio retorna [].
- Trigger de ajuda: função pura `isHelpCommand(text)` testada.

## Fora de escopo

- Orçamento anual/rollover de meta; metas por item; edição de patrimônio inicial manual.
