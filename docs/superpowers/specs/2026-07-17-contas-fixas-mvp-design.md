# Controle de Gastos Particular — MVP (Fundação + Contas Fixas)

**Data:** 2026-07-17
**Status:** Aprovado (design) — aguardando revisão da spec
**Fase:** 1 de 6

## Objetivo

Substituir a planilha `Contas Mensais.xlsx` por uma aplicação web, começando pelo
domínio **Contas Fixas** (receitas e despesas fixas mês a mês). O app passa a ser a
fonte de verdade: importa o histórico da planilha uma vez e, a partir daí, todo
cadastro e edição acontece no app. Deploy na **Vercel**.

Esta é a Fase 1. Os demais domínios (Investimentos, Dividendos, Financiamento, NFs,
IPVA, Cartão) virão em fases posteriores, cada uma com sua própria spec.

## Decisões de produto (definidas em brainstorming)

- **Papel do app:** substituir a planilha (CRUD completo, fonte de verdade).
- **Escopo do MVP:** fundação (auth, banco, layout, import) + domínio Contas Fixas completo.
- **Acesso:** single-user. Login com Google (Auth.js), liberado apenas para e-mails de uma allowlist.
- **Controle por conta/mês:** valor **previsto** + marcação **pago** com **valor real** e **data de pagamento**.
- **Classificação:** cada item pertence a uma **categoria** (gerenciável), e a categoria define se é **receita ou despesa**.

## Stack

- **Next.js (App Router) + TypeScript** — Server Components para leitura, Server Actions para escrita.
- **Tailwind CSS + shadcn/ui** — UI.
- **Recharts** — gráficos.
- **Prisma + PostgreSQL (Supabase)** — dados e migrations (pooled `DATABASE_URL` + direta `DIRECT_URL`).
- **Auth.js (NextAuth v5)** — login Google, sessão JWT, sem tabela de sessão.
- **Zod** — validação compartilhada entre Server Action e formulário.
- **Vitest** + **Playwright** — testes.
- **Deploy:** Vercel. Banco: Supabase (Postgres gerenciado, com pooler pgBouncer).

## Arquitetura

```
app/
  (auth)/login/                 tela de login
  acesso-negado/                e-mail fora da allowlist
  (app)/
    dashboard/                  cards, gráficos, ranking, projeção
    mes/                        lançamentos do mês (coração do app)
    itens/                      CRUD de itens
    categorias/                 CRUD de categorias
  api/auth/[...nextauth]/       handler do Auth.js
lib/
  prisma.ts                     client Prisma (singleton)
  auth.ts                       config Auth.js + allowlist
  money.ts                      aritmética em centavos (sem float)
  calc.ts                       funções puras: totais, saldo, falta-pagar, ranking, agregação por categoria
  validators.ts                 schemas Zod
components/ui/                  componentes shadcn
prisma/schema.prisma            modelo de dados + migrations
scripts/import.ts               import único da planilha (npm run import)
middleware.ts                   protege todas as rotas do grupo (app)
```

- **Leitura:** Server Components consultam o Prisma diretamente no servidor.
- **Escrita:** Server Actions validadas com Zod; `revalidatePath` atualiza a UI após mutação.
- **Cálculos:** funções puras em `lib/calc.ts` e `lib/money.ts`, isoladas e testáveis sem banco.
- **Auth:** `middleware.ts` exige sessão nas rotas `(app)`; callback `signIn` do Auth.js valida o e-mail contra `ALLOWED_EMAILS`.

## Modelo de dados (Prisma)

Três entidades no MVP. Auth.js roda com sessão JWT, sem tabelas de usuário/sessão.

### Category
| Campo | Tipo | Observação |
|-------|------|------------|
| id | String (cuid) | PK |
| name | String | "Saúde", "Assinaturas", "Renda"… |
| type | Enum `INCOME` \| `EXPENSE` | define se os itens somam ou subtraem |
| color | String | cor para gráficos (hex) |
| createdAt | DateTime | |

### Item
Uma "linha" da planilha (YOUTUBE, SALÁRIO, ESTACIONAMENTO…).
| Campo | Tipo | Observação |
|-------|------|------------|
| id | String (cuid) | PK |
| name | String | |
| categoryId | String (fk → Category) | item herda o tipo (receita/despesa) da categoria |
| dueDay | Int? | "DIA PGTO" (1–31), opcional |
| active | Boolean | arquivar sem apagar histórico (default true) |
| notes | String? | |
| createdAt | DateTime | |

### MonthlyEntry
Uma "célula": um item numa competência.
| Campo | Tipo | Observação |
|-------|------|------------|
| id | String (cuid) | PK |
| itemId | String (fk → Item) | |
| month | Date | competência, sempre dia 1 do mês |
| plannedAmount | Decimal(12,2) | valor previsto |
| paid | Boolean | default false |
| paidAmount | Decimal(12,2)? | valor efetivamente pago |
| paidDate | Date? | data do pagamento |

Restrições: `@@unique([itemId, month])`, `@@index([month])`.

**Derivados (não armazenados):** `TOTAL` por item/mês e `RANK` são calculados em query/`lib/calc.ts`.
**Projeção futura:** meses futuros são apenas `MonthlyEntry` com `paid=false`.

## Telas

### 1. Login
Botão "Entrar com Google". E-mail fora da allowlist → redireciona para `/acesso-negado`.

### 2. Dashboard (por mês, com navegação ‹ mês ›)
- Cards: **Total Receitas**, **Total Despesas**, **Saldo**, **Falta Pagar** (soma dos não pagos).
- Gráfico **Despesas por Categoria** (rosca).
- **Ranking** de despesas do mês (barras) — equivalente ao `RANK`.
- **Projeção de saldo** dos próximos meses (linha), a partir dos lançamentos futuros.

### 3. Mês / Lançamentos (coração — equivale à matriz da planilha)
- Seletor de competência; tabela agrupada por categoria.
- Linha: item · previsto · **toggle pago** · valor pago · data pgto · dia venc.
- Edição inline; subtotais por categoria e totais gerais (receita, despesa, saldo).
- Ações em lote: **"copiar mês anterior"** e **"aplicar valor de X até Y"**.
- Adicionar item ao mês (escolher Item existente ou criar na hora).
- Empty state (mês sem lançamentos) sugere "copiar mês anterior".

### 4. Itens
CRUD: nome, categoria, dia de vencimento, ativo/arquivado.

### 5. Categorias
CRUD: nome, tipo (receita/despesa), cor.

## Import da planilha (`scripts/import.ts`, `npm run import`)

Operação **única** por script (não por upload na UI — mais robusto para as irregularidades do arquivo).

- Lê a aba **Contas Fixas** do `.xlsx`. Cabeçalho (linha 1) define as competências; coluna A = nome do item; coluna B = `DIA PGTO`.
- Normalizações necessárias (observadas no arquivo real):
  - `DIA PGTO` às vezes é texto (`'5'`) em vez de número.
  - Números com espaço não-quebrável (`'\xa0449'`) — trim antes de parsear.
  - Células vazias = sem lançamento naquele mês (não cria `MonthlyEntry`).
  - `SALÁRIO` é receita.
- Semeia categorias base: **Renda, Moradia, Saúde, Assinaturas, Transporte, Seguros, Outros**.
- Atribuição **best-effort por palavra-chave** (ex.: SEGURO→Seguros; YOUTUBE/PS PLUS/INVESTIDOR 10→Assinaturas; HANA/AUDREY/VITAMINAS/TIREÓIDE→Saúde; ESTACIONAMENTO→Transporte); demais itens → "Outros". Usuário reclassifica na tela de Itens.
- Ignora colunas `TOTAL`/`RANK`, mas usa `TOTAL` para **validar** a soma importada e logar divergências.
- **Idempotente:** flag `--reset` limpa e reimporta; transacional.

## Tratamento de erros

- Toda Server Action valida entrada com Zod; erros retornam tipados e são exibidos inline no formulário.
- Violação de `@@unique([itemId, month])` → mensagem "já existe lançamento para este item neste mês".
- Não autenticado → redireciona para `/login`; e-mail fora da allowlist → `/acesso-negado`.
- Dinheiro: cálculos em **centavos (inteiro)** via `lib/money.ts`; nunca soma direta de float. Exibição com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Datas de competência sempre normalizadas para o dia 1 (UTC) para evitar problemas de fuso.

## Testes

- **Vitest (unit):** `lib/money.ts` e `lib/calc.ts` (totais, saldo, falta-pagar, ranking, agregação por categoria) e o parser de `scripts/import.ts` (normalização dos valores irregulares).
- **Playwright (e2e), caminho crítico:** com auth stubada — navegar entre meses, marcar um lançamento como pago e ver os totais/"falta pagar" atualizarem; CRUD de item e de categoria.
- Desenvolvimento guiado por testes (TDD) na fase de implementação.

## Configuração / variáveis de ambiente

- `DATABASE_URL` — Postgres pooled do Supabase (pgBouncer, porta 6543).
- `DIRECT_URL` — conexão direta do Supabase (porta 5432), usada pelas migrations.
- `AUTH_SECRET` — Auth.js.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — OAuth Google.
- `ALLOWED_EMAILS` — lista de e-mails liberados (nunca hardcoded no código).

Segredos ficam em variáveis de ambiente / gerenciador de segredos da Vercel — nunca no repositório.

## Fora de escopo (Fase 1)

- Demais domínios da planilha (ver roadmap).
- Cotações de mercado, recorrência automática de lançamentos, multiusuário, app mobile nativo, exportação para planilha.

## Roadmap (pós-MVP)

| Fase | Domínio | Notas |
|------|---------|-------|
| 2 | Investimentos + Dividendos | inclui cotações de mercado (definir fonte) |
| 3 | Financiamento Carro | |
| 4 | NFs Emitidas | |
| 5 | IPVA + Licenciamento | |
| 6 | Cartão de Crédito | parcelas distribuídas por competência |

Cada fase terá spec → plano → implementação próprios.
