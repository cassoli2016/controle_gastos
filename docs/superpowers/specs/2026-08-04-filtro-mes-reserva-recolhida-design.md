# Filtro de contas no Mês + cards de reserva recolhidos — Design

**Data:** 2026-08-04
**Motivação:** localizar a conta a pagar/receber hoje exige rolar a tela inteira (pior no celular); as seções "Reserva" e "Retirada da reserva" acumulam linhas de movimentos já concluídos e ocupam meia tela.

## Comportamento

### Filtro de busca

- Campo "Buscar conta…" com ícone de lupa logo acima dos cards de categoria: largura total no mobile, ~`w-80` no desktop; `type="search"`, `aria-label="Buscar conta"`, botão ✕ limpa quando há texto.
- Filtragem **instantânea em memória** (sem ida ao servidor), pelo **nome da linha** (`itemName`), ignorando maiúsculas e acentos: "alug" acha ALUGUEL, "credito" acha Crédito.
- Linhas sem match somem; categoria sem nenhuma linha visível some; contador ("x/y pagos") e subtotal de cada card refletem só as linhas visíveis.
- Nenhum match em nada: card único com "Nenhuma conta encontrada para “{texto}”."
- **Fora do alcance do filtro:** os 4 stat cards do topo (Receitas/Despesas/Saldo/Falta pagar) sempre mostram o mês inteiro; header, botões de ação e formulários do rodapé não mudam.
- A linha derivada "Reserva do dia a dia" participa do filtro como qualquer outra.

### Cards de reserva recolhidos

- Os cards das categorias **"Reserva"** e **"Retirada da reserva"** (nomes das constantes de `lib/reserve-flow.ts`) iniciam **recolhidos**: só o cabeçalho atual (título, contador, badge, subtotal) + chevron indicando expansão.
- Tocar/clicar no cabeçalho alterna expandido/recolhido; cabeçalho é `<button>` com `aria-expanded`; chevron gira.
- Demais categorias continuam sempre abertas, sem toggle.
- Estado **não persiste**: trocar de mês ou recarregar volta ao padrão (recolhidos).
- **Interação com a busca:** com texto de busca ativo, card de reserva com match aparece **expandido automaticamente** mostrando os matches; limpar a busca devolve o estado manual de recolhimento.

## Arquitetura

- `app/(app)/mes/MonthEntryList.tsx` (**novo, client**): recebe da página `views` (linhas prontas, serializáveis), `month`, `categories`, `reserves`. Contém o input de busca, o estado de recolhimento e a renderização dos cards de categoria — o `EntryRow` e o markup dos grupos migram de `page.tsx` para cá **sem mudança visual**. `groupByCategory` roda sobre as linhas filtradas.
- `lib/month-filter.ts` (**novo, puro**): `normalizeText(s)` (lowercase + remoção de diacríticos) e `filterViews(views, query)` — testado em `tests/month-filter.test.ts`.
- `app/(app)/mes/page.tsx`: continua server component; busca dados, monta `views` (com `overdue`/`readOnlyHint`) e stat cards como hoje; a lista delega ao `MonthEntryList`. O estado vazio do mês (nenhum lançamento real) permanece na página.
- Sem mudança de schema, rotas ou server actions.

## Versão

- Bump `package.json` `1.0.0 → 1.1.0` nesta entrega (o rodapé da sidebar exibe a versão). Política contínua: toda entrega bumpa a versão (minor para feature, patch para fix).

## Testes e verificação

- Unit: `tests/month-filter.test.ts` (case-insensitive, acentos, match parcial, query vazia retorna tudo).
- Suítes completas (`npm test`, `tsc`, lint, build) + e2e existente (7/7) — a tela não muda de markup com busca vazia e cards não-reserva.
- Verificação visual com Playwright (desktop 1280 e mobile 390, dados reais somente leitura): busca "alug" filtrando, cards de reserva recolhidos, expansão ao tocar, expansão automática ao buscar "retirada".
