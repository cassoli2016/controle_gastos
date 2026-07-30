# Higiene & Quick Wins — Design (Fase 1 do ciclo de melhorias)

**Data:** 2026-07-30
**Contexto:** Vistoria completa das 8 telas com dados reais + backlog técnico anotado desde
julho. O usuário escolheu atacar 4 temas (funcionalidades novas, polish visual, higiene,
fatura no app); esta fase é a primeira por destravar as demais. Design aprovado pelo usuário.

**Fases seguintes (specs próprias quando chegarem):** 2) importador de fatura Bradesco no
app; 3) polish visual (cards de cartão ricos, limite com barra de uso); 4) orçamento por
categoria, patrimônio projetado, foto de comprovante no bot.

## a) Unificar categorias de receita (dados)

Existem duas categorias INCOME: "Recebimentos" (#669d34, 1 item ativo, 7 lançamentos — a
canônica, usada pelo bot via `resolveIncomeCategoryId`) e "Renda" (#22c55e, 1 item arquivado
"Salário Mensal", 0 lançamentos). Script one-off move o item de "Renda" → "Recebimentos" e
exclui "Renda". Idempotente: sem "Renda" no banco, não faz nada.

## b) Paleta de categorias distinta (dados)

Colisões atuais: Cartão/Compras e Outros com o mesmo #64748b; Alimentação #707c8f quase
igual; Audrey #fefb41 ≈ Educação #f7f13b; Lazer #b18cfe ≈ Assinaturas #a855f7. A pizza do
Dashboard fica ilegível. No mesmo script, aplicar paleta com matizes separados, mantendo as
cores já boas:

| Categoria | Cor | |
|---|---|---|
| Saúde | `#ef4444` | mantém (vermelho) |
| Transporte | `#f59e0b` | mantém (âmbar) |
| Educação | `#eab308` | novo (amarelo) |
| Alimentação | `#84cc16` | novo (lima) |
| Recebimentos | `#10b981` | novo (esmeralda, receita) |
| Seguros | `#14b8a6` | mantém (teal) |
| Moradia | `#3b82f6` | mantém (azul) |
| Cartão/Compras | `#6366f1` | novo (índigo) |
| Assinaturas | `#a855f7` | mantém (roxo) |
| Lazer | `#d946ef` | novo (fúcsia) |
| Audrey | `#ec4899` | novo (rosa) |
| Outros | `#64748b` | mantém (cinza — semântico p/ "Outros") |

Match por nome exato; categoria ausente é ignorada (log). Idempotente.

## c) Itens: busca + filtro de status (UI)

`/itens` mistura ativos e arquivados numa lista longa sem busca (duplicatas arquivadas
poluem: Internet ×2, Plano de Saúde ×2). Padrão do app é estado na URL (como `?month=`):

- `?q=<texto>` — busca por nome (case/acento-insensitive, server-side).
- `?status=ativos|arquivados|todos` — default **ativos** (muda o comportamento atual, que
  listava tudo; arquivados continuam acessíveis pelo filtro).
- UI: input de busca (form GET) + 3 links-tab com contagem. Nada de estado client novo.
- Arquivados NÃO são apagados (preservam histórico de lançamentos).

## d) Robustez técnica (follow-ups anotados desde 2026-07-17)

1. **`decimalToCents` com guard de NaN** (`lib/money.ts`): entrada não numérica lança
   `Error` com a string recebida (falha alta e cedo, em vez de propagar NaN silencioso
   pelos totais).
2. **Guard de `?month=` malformado**: `sanitizeMonth(s: string | undefined): string | null`
   em `lib/dates.ts` (regex `^\d{4}-(0[1-9]|1[0-2])$`); páginas que leem
   `searchParams.month` (dashboard, mes, panorama, cartoes) usam
   `sanitizeMonth(qMonth) ?? await resolveDefaultMonth()` — URL inválida cai no mês padrão
   em vez de quebrar a query.
3. **Server actions com erro amigável**: mutações consumidas via `useActionState` ganham
   try/catch devolvendo `{ error: "Não foi possível salvar. Tente de novo." }` em vez de
   estourar o error boundary. Helper `guardAction` em `lib/action-guard.ts`, aplicado às
   actions de `mes`, `cartoes`, `categorias`, `itens`, `reservas`, `investimentos`.
4. **Categoria por id no Dashboard**: `EntryView` ganha `categoryId`; `expenseByCategory`
   agrega por id (nome continua sendo o rótulo); o mapa de cores da pizza passa a ser por
   id. Linha derivada da reserva usa id sintético estável (`daily-budget`). Elimina o bug
   latente de categorias homônimas somarem juntas/na cor errada.
5. **`middleware.ts` → `proxy.ts` (Next 16)**: verificar em `node_modules/next/dist/docs/`
   se é rename direto; se sim, incluir; se houver mudança de API relevante, adiar e
   registrar (não bloqueia esta fase).

## Testes

- `sanitizeMonth` (válido/malformado/undefined), guard de `decimalToCents`,
  `expenseByCategory` por id (homônimos não se misturam), filtro/busca de itens como
  função pura (`filterItems(items, q, status)`).
- Verificação visual: /itens (busca+tabs), /dashboard (pizza com cores novas), /categorias.

## Fora de escopo

- Excluir itens arquivados; color picker novo em Categorias (edição já existe).
- Qualquer item das fases 2–4.
