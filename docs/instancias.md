---
type: Runbook
title: Cópias do app — criar, entregar, atualizar e remover
description: Como operar o app em múltiplas instâncias (uma por pessoa), cada uma com seu deploy na Vercel e seu schema Postgres no mesmo Supabase do dono.
tags: [instancias, provisionamento, deploy, vercel, supabase, schema]
timestamp: 2026-10-03
---

# Cópias do app

A mesma base de código roda em vários deploys — um por pessoa. Cada cópia tem
seu próprio projeto na Vercel, seu próprio domínio e seu próprio schema
dentro do **mesmo** projeto Supabase do dono. Este documento é o runbook de
quem opera isso: o dono.

## A consequência aceita

O isolamento entre cópias é **lógico, não físico**. Todos os schemas vivem no
mesmo banco Postgres, no mesmo projeto Supabase; quem tem a connection string
do projeto alcança todos eles, não só o seu. Para o cenário escolhido aqui —
familiares, com o dono operando as cópias — isso é uma troca aceitável, não
um descuido. Quem precisar de isolamento de verdade (dado que o dono não
alcança) precisa de um projeto Supabase próprio, não de um schema aqui.

## 1. Criar uma instância nova

1. Rode o provisionador primeiro em modo leitura:
   ```
   npm run instancia:nova -- <schema> --dry-run
   ```
   Ele lista quantas das migrations estão pendentes para esse schema (todas,
   se for instância nova) e não executa nenhum `CREATE SCHEMA` nem aplica
   nada. Confira a saída antes de seguir.
2. Rode de verdade, sem `--dry-run`:
   ```
   npm run instancia:nova -- <schema>
   ```
   Isso cria o schema no Postgres, cria a tabela de controle do Prisma nele,
   aplica as migrations pendentes e imprime um bloco de variáveis com uma
   `APP_PASSWORD` e um `AUTH_SECRET` sorteados na hora.
3. Crie um projeto novo na Vercel apontando para o **mesmo repositório** e a
   **mesma branch** (`main`) que o projeto do dono usa. Não é um fork nem uma
   cópia de código — é outro deploy do mesmo código.
4. Cole o bloco de variáveis impresso no passo 2 nas Environment Variables
   desse projeto Vercel — mas ele é **parcial**: `envBlock()` só sabe gerar
   `DATABASE_SCHEMA`, `APP_NAME`, `APP_URL`, `APP_PASSWORD` e `AUTH_SECRET`,
   nunca a connection string. Sem completar à mão o que falta, o projeto
   sobe sem conseguir falar com o banco. Complete:
   - `DATABASE_URL`: cole o **mesmo valor** do projeto do dono, sem alterar
     nada. É contraintuitivo — mas é o mesmo projeto Supabase; o que separa
     as cópias é o `DATABASE_SCHEMA` (esse sim no bloco impresso), não a
     connection string.
   - `DIRECT_URL`: pode ficar **de fora** da Vercel com segurança, mesmo
     aparecendo como obrigatória no `.env.example`. Ela só serve ao
     `migrate`/CLI local — o datasource que a usa em `prisma.config.ts` entra
     condicionalmente, só quando a variável existe, e o `postinstall` do
     deploy roda apenas `prisma generate`, que não precisa dela.
   - Complete os placeholders de `APP_NAME` e `APP_URL` com o nome e o
     domínio dessa pessoa.
   - `CRON_SECRET`: sorteie um valor e cadastre. Sem ele, `/api/cron/quotes`
     e `/api/cron/resumo` ficam abertos sem autenticação nessa cópia — nenhum
     dos dois devolve dado financeiro no corpo da resposta, mas o endpoint
     fica exposto para qualquer um disparar.

   Depois de salvar as variáveis, **dispare um redeploy.** O projeto Vercel
   já buildou ao ser criado no passo 3 — antes de qualquer variável existir
   — e `/manifest.webmanifest` (rota estática) congela nesse build o
   `appName()` lido naquele momento. Sem um redeploy agora, a cópia nasce
   com o nome errado nesse arquivo até o próximo build acontecer por outro
   motivo.
5. Aponte o domínio da cópia (próprio ou subdomínio) para esse projeto
   Vercel.
6. Acrescente o nome do schema novo a `INSTANCE_SCHEMAS` no `.env` do dono.
   Sem esse passo o schema fica fora de `npm run instancia:atualiza` —
   provisionado, mas esquecido nas atualizações seguintes.

## 2. Entregar a instância

- Passe a senha (`APP_PASSWORD`) para a pessoa por um canal separado do
  texto deste runbook — ela é a única credencial de acesso ao app.
- **Telegram exige um bot próprio por cópia.** Um bot do Telegram tem um
  único webhook, e esse webhook aponta para uma única instância. O bot que
  já existe para o dono não serve para uma cópia nova: sem um bot (e um
  `TELEGRAM_BOT_TOKEN`) dedicado àquela pessoa, o recurso de lançar gastos
  pelo Telegram simplesmente não funciona ali.
- **`BRAPI_TOKEN` e `OPENROUTER_API_KEY` são chaves do dono, com custo do
  dono.** Deixar as duas em branco na cópia é uma opção legítima, não uma
  configuração incompleta: o app funciona inteiro sem elas — cotações da B3
  continuam funcionando com um limite de chamadas menor (plano gratuito sem
  token), a leitura de comprovante por foto no bot responde que não está
  configurada, e o bot do Telegram fica calado nessa função específica. Nada
  quebra.
- **Prefira um `APP_NAME` curto.** Ele aparece dentro da ilustração da tela
  de login, num texto ancorado à esquerda do cartão — um nome longo encosta
  na borda.

## 3. Atualizar as instâncias

Um `push` na `main` redeploya **todas** as cópias automaticamente, porque
todas apontam para o mesmo repositório e a mesma branch — isso a Vercel já
faz sozinha. O que a Vercel **não** faz é tocar no banco: cada schema só
recebe as migrations novas quando alguém manda.

1. Primeiro, sempre em modo leitura:
   ```
   npm run instancia:atualiza -- --dry-run
   ```
2. Confira o relatório e então aplique de verdade:
   ```
   npm run instancia:atualiza
   ```

O relatório final classifica cada schema em um de três estados:

- **ok** — migrations aplicadas (ou, em `--dry-run`, só contadas) sem erro.
  Aparece como `N aplicada(s)` quando havia pendência, ou `em dia` quando não
  havia nenhuma — são duas leituras do mesmo estado, não dois estados
  diferentes.
- **não provisionado** — o schema está listado em `INSTANCE_SCHEMAS` mas
  nunca passou por `npm run instancia:nova`. Não é tratado como erro de
  migration; o relatório diz isso explicitamente e indica o comando a rodar.
- **falhou** — algum erro impediu aplicar as migrations daquele schema (ex.:
  migration quebrada, conexão caiu). O relatório mostra a mensagem de erro
  junto do nome do schema.

Uma falha (ou um "não provisionado") num schema **não impede** os demais de
serem processados — o relatório lista cada schema com seu próprio resultado,
e só o código de saída do processo reflete que houve algo a revisar.

Para agir só sobre uma instância, use `--schema <nome>` em vez de depender de
`INSTANCE_SCHEMAS`:
```
npm run instancia:atualiza -- --dry-run --schema <nome>
```

## 4. Remover uma instância

Nessa ordem, sempre:

1. Exporte o schema antes de mexer em qualquer coisa, usando a `DIRECT_URL`
   (conexão de sessão, porta 5432) — a mesma que o passo 4 da criação ensina
   a deixar de fora da Vercel. **Não** use a `DATABASE_URL` (pooler em modo
   transação, porta 6543): `pg_dump` não funciona de forma confiável atrás
   do pooler em modo transação; a conexão de sessão é a que serve:
   ```
   pg_dump -n <schema> <direct-url> > <schema>-backup.sql
   ```
2. Confira o tamanho do arquivo antes de seguir — um `.sql` de poucos bytes
   (ou vazio) é sinal de exportação que falhou em silêncio, e seguir com os
   próximos passos destruiria o schema sem backup de verdade.
3. Derrube o projeto na Vercel dessa pessoa.
4. **Só então** derrube o schema no Postgres.

Nenhum script de provisionamento apaga schema de instância — isso é manual,
de propósito. `npm run instancia:nova` e `npm run instancia:atualiza` nunca
fazem `DROP SCHEMA`, nem com flag, nem com confirmação (o único `DROP SCHEMA`
do repositório está em `scripts/e2e-reset-db.ts`, contra o schema `e2e` de
teste — nunca contra o schema de uma pessoa real). Remover uma instância é
uma decisão irreversível demais para automatizar aqui.

## 5. Ressalvas que não cabem em nenhum passo acima

- **Trocar `APP_NAME` exige redeploy, não só salvar a variável na Vercel.**
  O manifest do PWA (`/manifest.webmanifest`, gerado por `app/manifest.ts`) é
  uma rota estaticamente otimizada — o build do Next marca essa rota `○` e
  congela ali o valor de `appName()` lido no momento do build. Mudar
  `APP_NAME` nas Environment Variables sem disparar um novo deploy deixa o
  nome antigo nesse arquivo até o próximo build acontecer por outro motivo.
  (As demais telas que mostram o nome, como `/novidades`, são dinâmicas —
  `ƒ` no build — e leem a variável a cada request, então essas já refletem a
  mudança sem precisar de redeploy.)
- **`npm run smoke:vazio` não roda ao mesmo tempo que `npm run dev`.** Os
  dois escrevem no mesmo diretório `.next/`. O smoke confere as portas antes
  de subir qualquer coisa e explica o conflito se encontrar uma ocupada, mas
  feche o `dev` antes de rodar o smoke.
- **Risco residual conhecido, ainda não exercitado de verdade:** o caminho
  de escrita através do pooler do Supabase em modo transação (pgbouncer)
  nunca foi testado com uma escrita real. A verificação dos scripts de
  instância foi feita contra um Postgres local em Docker (sem pgbouncer na
  frente) e, contra o banco real, só com `--dry-run` (somente leitura). **O
  primeiro `npm run instancia:nova` de verdade, fora de `--dry-run`, é o
  primeiro teste desse caminho.** Rode o `--dry-run` antes como de costume, e
  fique perto do terminal na primeira execução real.
