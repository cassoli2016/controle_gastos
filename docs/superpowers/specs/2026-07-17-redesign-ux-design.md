# Redesign de UX/UI — Contas Fixas

**Data:** 2026-07-17
**Status:** Aprovado (design) — aguardando revisão da spec
**Base:** MVP Contas Fixas já em produção (ver `2026-07-17-contas-fixas-mvp-design.md`). Este redesign melhora a usabilidade/estética sem mudar o modelo de dados nem as regras de domínio.

## Objetivo

Elevar muito a usabilidade e a estética do app, mantendo toda a lógica existente (money em centavos, competência UTC, Server Actions + Zod, auth por senha, Prisma/Supabase). Redesign responsivo de verdade (mobile + desktop), visual **fintech limpo e moderno**, tema **claro/escuro**, **accent azul**.

## Decisões (brainstorming)

- **Dispositivos:** responsivo real (mobile e desktop igualmente bons).
- **Estética:** fintech limpo e moderno (respiro, cards, números em evidência).
- **Tema:** claro e escuro (persistido; segue o sistema por padrão).
- **Accent:** azul (alinhado à marca cassolitech). Semânticos: receita = verde, despesa = vermelho suave, falta pagar = âmbar.
- **Base de componentes:** **shadcn/ui + Tailwind** (Radix, componentes no repo, acessíveis).

## Stack de UI (adições)

- **shadcn/ui** (CLI `shadcn@latest`, compatível Tailwind v4 / React 19 / Next 16). Componentes: `button, card, input, label, select, dialog, alert-dialog, sheet, table, tabs, dropdown-menu, badge, skeleton, switch, sonner`.
- **next-themes** para claro/escuro (toggle persistido).
- Dependência transitiva: Radix UI (via shadcn). Sem UI kit externo (Mantine/MUI).

## App shell (responsivo)

- **Desktop (≥ md):** top bar (nome do app + seletor de mês global + toggle de tema + Sair) e **sidebar** com Dashboard / Mês / Itens / Categorias (item ativo destacado em azul).
- **Mobile (< md):** top bar compacta (hambúrguer abre **Sheet** com a navegação) + **bottom nav** com os 4 destinos (alvos de toque grandes). Seletor de mês no topo do conteúdo.
- Toggle de tema (claro/escuro) via `next-themes`, persistido.
- Substitui a nav de links atual em `app/(app)/layout.tsx`.

## Design tokens

- **Primary:** azul (ex.: `blue-600`); neutros `zinc`/`slate`.
- **Semânticos:** receita = verde, despesa = vermelho suave, falta pagar = âmbar.
- Claro/escuro via CSS variables (padrão shadcn em `globals.css`). Raios ~`lg`, sombras suaves.
- Tipografia com **números tabulares** (`tabular-nums`) para alinhar colunas de dinheiro.
- Dinheiro sempre via `formatCents` (pt-BR). Nada de `.toFixed()` cru.

## Telas

### Dashboard
- Seletor de mês (‹ / ›) no topo.
- **4 KPI cards:** Receitas, Despesas, Saldo, Falta pagar (ícone, valor grande, cor semântica). Mobile: 2 colunas.
- **2 cards de gráfico:** Despesas por categoria (rosca, cores da categoria) e Projeção de saldo (linha, próximos 6 meses). Mobile: empilham.
- **Ranking de despesas:** barras horizontais + valor.

### Mês / Lançamentos (coração)
- Seletor de mês + ações: **+ Lançamento**, **Aplicar em lote**, **Copiar mês anterior**.
- **Seções por categoria** (colapsáveis) com **subtotal** por categoria.
- Cada lançamento: item · dia venc · previsto · **estado/ação de pagamento** · valor pago.
- **Pagar:** popover/Dialog compacto com **valor** (pré-preenchido com o previsto, **máscara `R$ 1.234,56`**) + **data** (padrão hoje) → confirma. Pago mostra ✓ + valor + botão **Desmarcar**.
- **Editar previsto:** inline (máscara de moeda) → `upsertEntry`.
- **+ Lançamento / Aplicar em lote:** em **Dialog** (select de item com placeholder; no lote: de-mês/até-mês/valor).
- **Totais** (Receitas/Despesas/Saldo/Falta pagar) afixados (rodapé no mobile, topo/lateral no desktop).
- **Empty-state:** mensagem + botões Copiar mês anterior / Adicionar.
- **Mobile:** cada lançamento vira **card**; seções colapsáveis; totais em card fixo no rodapé.

### Itens e Categorias
- **Desktop:** `Table` shadcn limpa (colunas + ações). **Mobile:** cards.
- **Editar:** em **Dialog** (item inclui toggle `Ativo` — enviado explicitamente; categoria com seletor de cor + tipo).
- **Excluir/arquivar:** **AlertDialog** de confirmação. Erro "categoria em uso" via **toast**.
- **Categorias:** chip colorido + badge Receita/Despesa.

## Feedback e inputs (transversais)

- **Toasts (Sonner)** em toda ação (sucesso e erro). Substitui o feedback só-de-erro atual; a mensagem de guarda ("categoria em uso...") passa a aparecer.
- **Pendência:** botões desabilitam + spinner durante a Server Action (usar `pending` do `useActionState`).
- **Máscara de moeda pt-BR:** componente de input controlado que exibe `R$ 1.234,56` e submete o valor normalizado (reais). Reaproveitar/estender `lib/money.ts` (`parseBRLToCents`/`formatCents`) para a lógica de máscara; adicionar helper de reais↔string se necessário (com testes).
- **Datas:** input nativo (`type="date"`).
- **Select com placeholder** (corrige o footgun de item pré-selecionado).
- **Confirmação** (AlertDialog) para ações destrutivas.
- **Acessibilidade:** via Radix (teclado, foco, ARIA).
- **Skeletons** de carregamento nas áreas de dados.

## Fora de escopo

- Modelo de dados, regras de domínio, auth, deploy (inalterados). Sem novas fases de domínio (Investimentos etc.) aqui.

## Fases de implementação

| Fase | Entrega |
|------|---------|
| 1 | Fundação: shadcn + tokens (azul, claro/escuro via next-themes) + app shell (topbar/sidebar/Sheet/bottom-nav) + `<Toaster/>` + input de moeda (com teste) |
| 2 | Tela do Mês: seções/subtotais, dialog de pagar (valor+data), dialogs adicionar/editar/lote, toasts, empty-state, cards no mobile |
| 3 | Dashboard: KPI cards, cards de gráfico, ranking, responsivo |
| 4 | Itens & Categorias: tabelas/cards, dialogs de edição, AlertDialog de exclusão |

Cada fase é entregável e revisável isoladamente. Sem mudanças de banco.

## Riscos / notas

- shadcn/ui + Tailwind v4: usar a versão da CLI que suporta v4 (init pode ajustar `globals.css`/tokens). Validar `next-themes` com App Router (provider no root layout, `suppressHydrationWarning`).
- Reaproveitar as Server Actions e helpers existentes (`lib/calc`, `lib/money`, `lib/dates`, `groupByCategory`, `monthRange`); o redesign é de apresentação/interação, não de domínio.
- Máscara de moeda: cuidado com edição/caret; cobrir a lógica de parse/format com testes unitários.
