# Página Novidades (changelog do app) — Design

**Data:** 2026-08-04
**Motivação:** o usuário quer ver dentro do Grana o que já melhorou e o que vai melhorando; a versão do rodapé ganha significado (clicou, viu o que mudou).

## Comportamento

- Rota **`/novidades`** no grupo `(app)` (protegida por login, layout padrão com sidebar).
- Linha do tempo da mais recente para a mais antiga: **data em destaque** (pt-BR, ex.: "4 de agosto de 2026"), **badge discreto com a versão** (ex.: `v1.1.0`), título curto e bullets do que mudou.
- Texto em **linguagem de usuário**, não técnica: "Busca de contas na tela do Mês", nunca "refactor MonthEntryList".
- No rodapé da sidebar, o bloco "Grana · cassolitech / vX.Y.Z" vira **link para `/novidades`** (estilo atual, com affordance de hover).

## Conteúdo

- **Fonte:** `lib/changelog.ts` — array tipado exportado:
  ```ts
  type ChangelogEntry = { version: string; date: string /* YYYY-MM-DD */; title: string; items: string[] };
  ```
  Ordenado da mais recente para a mais antiga (a página confia na ordem do array).
- **Retroativo:** entradas reconstituídas do git log com as datas reais dos merges (MVP contas fixas, cartões e parcelamento, reservas/caixinha, investimentos, exportação CSV, seletor de mês…), todas sob `v1.0.0` (a versão nunca foi bumpada antes).
- **Política contínua:** todo PR que entrega melhoria adiciona sua entrada em `lib/changelog.ts` **no mesmo commit** do bump de versão do `package.json`. Passo padrão de todo plano de implementação daqui em diante.

## Arquitetura

- `lib/changelog.ts` (novo): dados puros, sem dependências.
- `app/(app)/novidades/page.tsx` (novo): server component simples que mapeia o array para a timeline (Cards ou lista com borda-guia; decisão visual na implementação seguindo o padrão shadcn do app).
- `components/app-shell/Sidebar.tsx`: rodapé vira `<Link href="/novidades">`.
- Sem mudança de schema, sem server actions, sem estado client.

## Testes e verificação

- Unit: formato/ordenação de `lib/changelog.ts` (datas válidas, ordem decrescente, versões semver) em `tests/changelog.test.ts`.
- Suítes completas + verificação visual (desktop/mobile) da página e do link do rodapé.
