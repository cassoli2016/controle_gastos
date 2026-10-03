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
   desse projeto Vercel. Complete os placeholders de `APP_NAME` e `APP_URL`
   com o nome e o domínio dessa pessoa.
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

O relatório final tem três estados possíveis por schema:

- **aplicou** (`N aplicada(s)`) — havia migration pendente e ela entrou.
- **em dia** — nada pendente, nenhuma ação.
- **não provisionado** — o schema está listado em `INSTANCE_SCHEMAS` mas
  nunca passou por `npm run instancia:nova`. Não é tratado como erro de
  migration; o relatório diz isso explicitamente e indica o comando a rodar.

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

1. Exporte o schema antes de mexer em qualquer coisa:
   ```
   pg_dump -n <schema> <connection-string> > <schema>-backup.sql
   ```
2. Derrube o projeto na Vercel dessa pessoa.
3. **Só então** derrube o schema no Postgres.

Nenhum script deste projeto apaga schema — isso é manual, de propósito.
`npm run instancia:nova` e `npm run instancia:atualiza` nunca fazem `DROP
SCHEMA`, nem com flag, nem com confirmação. Remover uma instância é uma
decisão irreversível demais para automatizar aqui.

## 5. Ressalvas que não cabem em nenhum passo acima

- **Trocar `APP_NAME` exige redeploy, não só salvar a variável na Vercel.**
  O manifest do PWA e rotas estaticamente otimizadas (como `/novidades`)
  congelam o valor no momento do build. Mudar `APP_NAME` nas Environment
  Variables sem disparar um novo deploy deixa o nome antigo nesses lugares
  até o próximo build acontecer por outro motivo.
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
