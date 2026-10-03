# Cópias do app para outras pessoas

Data: 2026-10-03 · Versão base: v1.32.0

## O que se quer

Duas ou três pessoas próximas usando o Grana, **cada uma com a própria cópia**:
endereço próprio, senha própria, banco próprio. Ninguém divide dado com ninguém
e ninguém vê dado de ninguém. O repositório continua privado; quem monta cada
cópia é o dono do projeto, manualmente, quando alguém pede.

Sucesso é: existir um roteiro curto que, seguido do começo ao fim, entrega a
alguém um endereço funcionando com um app vazio e utilizável — e que, quando o
app evoluir, as cópias acompanhem sem trabalho manual de código.

**Decisões do dono** (não são suposições): cópia por pessoa e não multi-usuário;
ele mesmo monta cada uma; 2 a 3 pessoas; repositório privado; schema por pessoa
no Supabase atual; changelog reescrito sem dado pessoal.

## O que a sondagem mediu

Antes de desenhar, o app rodou contra um Postgres local vazio (Docker,
descartado depois):

- As 29 migrations aplicam limpo num banco zerado — `prisma migrate deploy`
  funciona fora do pooler do Supabase.
- As 11 rotas (`/dashboard`, `/mes`, `/panorama`, `/cartoes`, `/reservas`,
  `/investimentos`, `/itens`, `/categorias`, `/calculadora`, `/ajustes`,
  `/novidades`) respondem 200 sem nenhum erro de página ou de console.
- "Lançar compra" funciona com **zero categorias**: o campo nasce em "Padrão
  (Cartão/Compras)" e `resolveDefaultPurchaseCategoryId` cria a categoria na
  hora. A primeira compra de um usuário novo não exige configuração.

Conclusão: o obstáculo não é o modelo de dados. É identidade, privacidade e
operação.

## Arquitetura

Uma base de código, N deploys, N schemas.

```
GitHub (privado, 1 repo)
   │  push na main
   ├──> Vercel "grana"          env: DATABASE_SCHEMA=public   APP_NAME=Grana
   ├──> Vercel "grana-fulano"   env: DATABASE_SCHEMA=fulano   APP_NAME=...
   └──> Vercel "grana-beltrano" env: DATABASE_SCHEMA=beltrano APP_NAME=...
                    │
                    └──> um projeto Supabase, um schema Postgres por cópia
```

Todas as cópias apontam para o mesmo repositório e a mesma branch, então **um
push atualiza todas**. `lib/prisma.ts` já lê `DATABASE_SCHEMA` e passa o schema
ao `PrismaPg` — nenhum código de acesso a dados muda.

O isolamento é lógico, não físico: quem tem a connection string alcança todos
os schemas. Para o cenário escolhido (familiares, dono operando) isso é
aceitável e está registrado aqui como consequência conhecida, não como
descuido. Se um dia alguém precisar sair com os próprios dados e a própria
conta, a migração é `pg_dump` do schema para um projeto Supabase novo.

## 1. Identidade por instância

Hoje o nome "Grana" aparece fixo em `app/layout.tsx`, `app/manifest.ts`,
`app/(app)/LockScreen.tsx` e `app/(app)/novidades/page.tsx`; o domínio
`grana.cassolitech.com.br` aparece duas vezes em `app/(auth)/login/page.tsx` e
mais uma como valor padrão em `scripts/telegram-webhook.ts`. Numa cópia, isso
seria o nome e o endereço de outra pessoa.

Passam a sair do ambiente, com o valor atual como padrão:

- `APP_NAME` — default `"Grana"`. Alimenta title, manifest, PWA, LockScreen e o
  texto de `/novidades`.
- `APP_URL` — o endereço da instância. O nome já é lido em
  `scripts/telegram-webhook.ts`, mas **não está configurado em lugar nenhum**:
  o script cai no domínio pessoal escrito no código. Vira variável de verdade,
  documentada no `.env.example`, e o fallback literal sai do script.
- O domínio exibido no login deixa de ser literal e passa a vir do `APP_URL`,
  sem esquema nem barra final. Sem `APP_URL`, o rodapé do login simplesmente
  não aparece — ausência vale mais que o endereço errado.

Um módulo `lib/branding.ts` concentra a leitura e os defaults, para o valor não
ser recalculado em cinco lugares.

## 2. Changelog sem rastro pessoal

`lib/changelog.ts` é a fonte de `/novidades`, e hoje carrega dado financeiro
real: saldos por caixinha com nome e valor, nomes de contas, de pessoas e de
empregador. Numa cópia, qualquer pessoa abriria a tela e leria tudo. **É o item
mais sério deste trabalho.**

As ~30 entradas são reescritas preservando *o que a mudança fez* e removendo
*quanto e de quem*: sai `"R$ 42.080,93 na Cristian Cassoli"`, fica `"o saldo
que já existia em cada caixinha"`.

Para não reintroduzir por descuido numa entrega futura, `tests/changelog.test.ts`
ganha duas guardas:

- nenhuma entrada pode conter valor em reais (`/R\$\s*\d/`);
- nenhuma entrada pode conter os termos de uma lista de nomes próprios mantida
  no próprio teste.

A guarda falha no `npm test`, que já roda antes de cada entrega — o erro
aparece antes de ir ao ar, não depois.

## 3. Categorização genérica

`lib/import-normalize.ts` categoriza descrições de fatura por regex, e algumas
regras usam nomes da família do dono. As regras universais ficam (farmácia,
remédio, dentista, tireoide); os nomes próprios saem. Numa cópia eles nunca
casariam, e no repositório são dado pessoal sem função.

## 4. Provisionador

`scripts/provisiona-instancia.ts <schema>` cria uma cópia do banco:

1. valida o nome do schema (minúsculas, sem espaço, nunca `public`);
2. `CREATE SCHEMA IF NOT EXISTS`;
3. aplica as 29 migrations em ordem e registra em `_prisma_migrations`;
4. imprime o bloco de variáveis pronto para colar na Vercel, com uma
   `APP_PASSWORD` e um `AUTH_SECRET` sorteados.

Passa pelo **pooler** (`DATABASE_URL`), não pelo `DIRECT_URL`: a porta direta do
Supabase não é alcançável da máquina de desenvolvimento, e é por isso que
`prisma migrate deploy` não roda aqui — a mesma razão que motivou o
`scripts/aplica-migration.ts`, cujo mecanismo de aplicar SQL e registrar a
migration é reaproveitado.

Herda os limites já documentados naquele script: sem transação em volta, sem
checagem de checksum, divisão do arquivo por `;` no fim da linha. Em troca é
idempotente e tem `--dry-run`, que imprime o que faria sem tocar no banco.

`scripts/e2e-reset-db.ts` continua existindo e separado: ele *derruba* o schema
antes de recriar, o que é certo para teste e catastrófico para uma instância de
verdade. Nenhum código é compartilhado entre os dois justamente para que o
`DROP SCHEMA` não tenha como chegar perto do provisionador.

## 5. Atualizar as cópias

O código se atualiza sozinho pelo push. O banco não.

`scripts/atualiza-instancias.ts` lê a lista de schemas de `INSTANCE_SCHEMAS`
(variável no `.env` do dono, separada por vírgula), e para cada um aplica as
migrations que faltam, relatando ao fim o que aplicou em cada schema e o que já
estava em dia. Suporta `--dry-run` e `--schema <nome>` para agir numa só.

## 6. Integrações opcionais

Verificado no código, não presumido — nenhuma delas precisa de conserto:

| Integração | Sem a chave |
|---|---|
| BRAPI (cotações) | funciona; o token só aumenta o limite de requisições |
| OpenRouter (foto de comprovante) | devolve "Leitura de foto não configurada (OPENROUTER_API_KEY)" |
| Telegram | `reply()` sai calado quando não há token; nada quebra |

Duas consequências vão para o runbook, não para o código:

- **Telegram exige um bot por cópia.** Um bot tem um único webhook, e o webhook
  aponta para uma única instância. Não há como compartilhar o bot do dono.
- **BRAPI e OpenRouter são chaves do dono, com custo do dono.** Deixar em branco
  na cópia é uma escolha legítima, e o app continua inteiro sem elas.

O `.env.example` é completado: faltam `BRAPI_TOKEN`, `CRON_SECRET`, `APP_URL` e
as novas `DATABASE_SCHEMA`, `APP_NAME` e `INSTANCE_SCHEMAS`, com um comentário
dizendo quais são obrigatórias (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`APP_PASSWORD`) e quais são opcionais.

## 7. Runbook

`docs/instancias.md`, em passos numerados: criar uma cópia (provisionador +
projeto Vercel + variáveis + domínio), entregar (como passar a senha, o que
dizer sobre Telegram), atualizar (push + `atualiza-instancias`), e remover
(derrubar o projeto Vercel, exportar o schema antes de dropar).

## 8. Rede de proteção

O teste que mais importa é o que foi feito à mão nesta sondagem, e que nenhum
teste atual cobre: **o app sobe contra um banco vazio e as telas respondem.** É
exatamente a regressão que mataria uma cópia nova — e ela não aparece no
ambiente do dono, cujo banco está cheio.

Vira `npm run smoke:vazio`: sobe um Postgres em Docker, aplica as migrations,
levanta o app contra ele, pede as 11 rotas e falha se alguma não responder 200
ou se o log tiver erro. Roda sob demanda, não no `npm test` — depende de Docker
e leva dezenas de segundos.

Os demais testes seguem o padrão do repositório: lógica pura em `tests/`. Do que
este trabalho cria, o que é testável assim é a validação do nome do schema, a
montagem do bloco de variáveis e as guardas do changelog.

## Fora do escopo

Multi-usuário no mesmo endereço, cadastro por e-mail, cobrança, abertura do
repositório e limpeza do histórico do git. Também fica de fora qualquer
automação da Vercel por API: com 2 a 3 cópias, criar o projeto pela interface
é mais rápido do que manter o código que faria isso.

## Riscos aceitos

- **Isolamento lógico.** Um vazamento da connection string alcança todas as
  cópias. Mitigação: a string vive só nas variáveis da Vercel e no `.env` local
  do dono.
- **Provisionador não é o `migrate`.** Migration nova precisa ser idempotente
  (`IF NOT EXISTS`) para poder ser repetida — exigência que já vale hoje para o
  `aplica-migration.ts`.
- **Suporte recai sobre o dono.** Esquecer a senha, renovar domínio e pagar o
  Supabase continuam sendo dele. É consequência de "eu monto para cada uma", e
  não de uma decisão técnica.
