---
type: Formato de Importação
title: Fatura Nubank (PDF fechado + CSV da fatura aberta)
description: Layout do PDF da fatura fechada do Nubank e do CSV da fatura em aberto, com as regras de competência e reconciliação para o app.
tags: [cartao, nubank, fatura, importacao, pdf, csv]
timestamp: 2026-08-05
---

# Fatura Nubank — modelo do PDF e do CSV

Modelo observado na fatura fechada em 05/08/2026 (vencimento 12/08/2026, 14 páginas)
e no CSV da fatura aberta seguinte (vencimento 12/09/2026). **Os dois arquivos contêm
dados pessoais (nome do titular e do adicional, 4 últimos dígitos de cada cartão) —
nunca commitar no repositório.**

Cartão no app: `closingDay = 4`, `dueDay = 12`, limite R$ 51.550,00.

## Estrutura do PDF

| Página | Conteúdo |
|--------|----------|
| 1 | Valor da fatura, **data de vencimento**, **período vigente**, limite total |
| 2–3 | Alternativas de pagamento (parcelar, mínimo, rotativo) — ignorar |
| 4 | **Resumo da fatura atual**, **Próximas faturas**, limites usado/disponível |
| 5–14 | **Transações**: compras do titular, compras do adicional, "Pagamentos e Financiamentos" |

## Resumo da fatura atual (página 4) — validação

```
Fatura anterior
(−) Pagamento recebido
(+) Total de compras de todos os cartões
(+) IOF de compras internacionais
(+) Outros lançamentos          (estornos, descontos de antecipação)
(=) Total a pagar
```

No modelo do app o consolidado do mês é a soma LÍQUIDA do extrato, então
"Fatura anterior" e o pagamento que a quita se cancelam (a fatura passada é o
consolidado do mês anterior, com vida própria). O que sobra:

```
compras do titular + compras do adicional
  + parcelas financiadas ("Pagamentos e Financiamentos")
  − antecipações do ciclo
  = Total a pagar
```

Na fatura-modelo: 15.097,66 + 3.220,94 + 20,94 − 455,25 = **17.884,29** ✓
(bate com o "Total a pagar" da página 4).

## Transações (páginas 5–14)

Formato de cada linha: `dd MMM  •••• NNNN  Descrição  R$ valor`

- **Duas seções de compras**, cada uma com subtotal: o titular e "Compras de
  \<nome do adicional\>". Ambas entram no mesmo consolidado.
- **Data do ciclo, não da compra**: TODA parcela é estampada no dia de abertura
  do ciclo (`05 JUL` na fatura-modelo), não na data da compra original. Só as
  compras à vista trazem a data real.
- **`- Parcela pp/tt`** no fim da descrição = parcela `pp` de `tt`. Cada fatura
  lista só a parcela corrente; `pp+1..tt` aparecem nas faturas seguintes com o
  mesmo valor.
- **`Antecipada - X - Parcela n/N`** + **`Desconto Antecipação X`** (negativo):
  quitação antecipada de um parcelamento — todas as parcelas restantes caem na
  mesma fatura, com o desconto como linha negativa. Entram normalmente.
- **`Crédito de "X"`** e **`IOF de volta de X`** (negativos): estorno. ENTRAM
  como linha negativa.
- **`Pagamentos e Financiamentos`** (última seção): as linhas `Pagamento em dd MMM`
  são pagamento da fatura anterior/antecipação e **não** viram compra; as linhas
  com `- Parcela pp/tt` são parcelamento de saldo devedor e **entram** no total.

## CSV da fatura em aberto

Cabeçalho `date,title,amount`, decimais em pt-BR entre aspas (`"75,27"`),
negativos com espaço após o sinal (`"- 4,68"`). `lib/csv-import.ts` já lê esse
formato; a única linha desconsiderada é `Pagamento recebido`.

Como no PDF, as parcelas vêm todas estampadas na data de abertura do ciclo, e
as compras à vista com a data real.

## Competência e o corte intradiário

O ciclo vai de `05 JUL a 05 AGO`, fecha 05/09 o seguinte e vence dia 12 —
`dueDay (12) > closingDay (4)`, então a competência é o próprio mês do
fechamento (`faturaMonth` em `lib/fatura.ts`): fatura fechada em 05/08 é
competência **agosto**.

`closingDay = 4` (e não 5) porque as parcelas estampadas em `05 JUL` pertencem
à fatura que vence em 12/08, e as estampadas em `05 AGO` à de 12/09.

**Atenção — o corte é intradiário.** A fatura-modelo foi emitida em 05/08 às
03:31, e por isso o dia 04/08 ficou PARTIDO entre as duas faturas: três compras
de 04/08 no PDF fechado e outras cinco no CSV do ciclo novo. Nenhum valor de
`closingDay` resolve isso — na reconciliação, o CSV manda: as linhas que ele
lista pertencem à fatura seguinte, mesmo que a data caia antes do fechamento.

## Deriva entre PDF e CSV

O "Saldo em aberto da próxima fatura" da página 4 (R$ 7.657,56) é um snapshot do
momento da emissão; o CSV exportado depois somava R$ 7.657,90. Os 34 centavos são
deriva do próprio banco — o CSV é a fonte mais recente e prevalece.

## Parser (`lib/nubank-fatura.ts`)

Implementado a partir da extração real do `unpdf`. As páginas 2–3 (alternativas
de pagamento) saem fragmentadas, com rótulo e valor em linhas separadas, mas o
resumo e as transações saem como linhas limpas — e são as únicas usadas.

### Âncoras

| Campo | Âncora |
|---|---|
| `dueDateISO` | `Data de vencimento: 12 AGO 2026` (meses abreviados em maiúsculo) |
| `closingISO` | `Fechamento da próxima fatura 05 SET 2026` menos 1 mês; fallback pelo fim de `Período vigente` |
| `totalCents` | `^Total a pagar R$ …$` — **ancorado na linha** |
| `limitCents` | `Limite total do cartão de crédito: …` (página 1) |
| `upcoming` | `Saldo em aberto da próxima fatura` / `Saldo em aberto total` |

A âncora do total precisa ser ancorada na linha: o detalhe de uma parcela
financiada traz `Total a pagar: R$ 83,74` (com dois-pontos) no meio das
transações, e a tabela de opções traz `Total a pagar` como rótulo solto.

Não usar `LIMITES DISPONÍVEIS` da página 4 — naquela tabela a coluna "Disponível"
repete o limite total.

### Invariante: duas rotas independentes

`expectedLinesCents` (a soma que as linhas de compra/estorno têm que dar) é
derivável do resumo por dois caminhos, e o parser exige que concordem — se o
resumo foi lido errado, eles divergem e a importação aborta antes de escrever:

```
rota A = compras + IOF + outros                        = 18.339,54
rota B = total a pagar + pagamento − fatura anterior    = 18.339,54
```

Checagens, em ordem: (1) identidade do resumo, (2) rota A = rota B, (3) soma das
linhas = `expectedLinesCents` — as três abortam; (4) soma dos pagamentos =
"Pagamento recebido" — só avisa, porque a seção "Pagamentos e Financiamentos"
mistura pagamento com parcelamento de saldo devedor.

`Total de compras de todos os cartões` (18.446,11) **não** é igual à soma dos
subtotais por pessoa (18.318,60), e a composição de "Outros lançamentos" não foi
determinada — os dois entram só como termos da identidade.

### Armadilhas do texto extraído

- **Negativos usam U+2212 (`−`), não hífen ASCII** — 10 ocorrências. O subtotal
  `Pagamentos e Financiamentos -R$ …` usa hífen, e não é parseado.
- **Valor deslocado:** a compra internacional e a parcela financiada põem o valor
  algumas linhas adiante, depois do câmbio / do detalhe do plano. O parser varre
  até 4 linhas procurando a que é só valor. Ignorá-las custaria R$ 36,69 e faria
  a checagem 3 abortar a importação sem dizer o motivo real.

### Projeção das parcelas: agrupar por plano

`buildInstallmentSchedule` (`lib/fatura-core.ts`) agrupa por **plano** — loja +
nº de parcelas + valor da parcela — e projeta a partir da **maior** parcela
cobrada na fatura. Projetar por linha duplica na quitação antecipada, quando o
Nubank cobra todas as parcelas restantes no mesmo ciclo (`Antecipada - X -
Parcela n/N`): daria R$ 26.234,86 em vez de R$ 20.028,97.

O valor por parcela entra na chave porque a mesma loja pode ter dois planos
simultâneos (`Associacao Franciscana`: 9× R$ 30,88 e 12× R$ 17,99).

## Como importar para o app

1. **Fatura fechada — conferir:** envie o PDF no Telegram. O bot valida o total
   contra o documento e compara com o que o app tem no mês, **sem gravar**.
2. **Fatura fechada — gravar:** tela **Cartões → Importar fatura**. O preview
   mostra as linhas e o **impacto mês a mês** antes de confirmar (ver a dívida
   aberta abaixo — é o que torna essa confirmação necessária).
3. **Fatura aberta:** envie o `.csv` no Telegram. O handler substitui só o mês
   majoritário e insere (sem apagar) o resíduo que cair em outro mês — ver
   "corte intradiário".
4. Reconciliação manual pontual: `scripts/fix-fatura-nubank-ago-2026.ts` (simula
   por padrão, grava só com `--apply`).

## Dívida aberta: duplicação nos meses futuros

Importar a fatura fechada **dobra** out/2026 → mai/2027 (medido: outubro iria de
R$ 5.197,94 para R$ 10.361,37). Não é regressão desta entrega — a regra anterior
faz o mesmo.

Causa: as linhas desses meses foram gravadas por importações antigas com
`purchaseDate` apontando para a **abertura do ciclo futuro** (2026-09-xx,
2026-10-xx) em vez da data da compra, e sob **duas convenções de parcela**
incompatíveis:

| Origem | Parcela onde | Descrição | `purchaseDate` |
|---|---|---|---|
| `addPurchaseToCard` (bot, share) | coluna `installmentSeq` | sem marcador (`Beto Carrero World`) | data da compra original |
| importação de CSV/fatura | marcador na descrição | `Beto Carrero*Beto Carr - Parcela 3/10` | abertura do ciclo |

As descrições das duas convenções nem casam entre si, então nem casar por plano
resolve. Nenhuma regra baseada em data reconhece essas linhas como projeção, e a
reconstrução soma em cima.

Medição que torna o conserto decidível: out→jan têm **43, 31, 16 e 6 linhas, todas
parcelas, zero compras à vista**, e os totais batem com a projeção a menos de 23
centavos — são duplicatas obsoletas do mesmo cronograma.

Enquanto isso não for limpo: o bot só confere, e o preview da web avisa qual mês
mais que dobra.

O `upcoming` do Nubank **não** serve para validar o cronograma: "Saldo em aberto
da próxima fatura" já inclui compras do ciclo novo (projeção de set/2026
R$ 6.716,86 + R$ 941,28 do ciclo novo ≈ R$ 7.657,56 do PDF). `scheduleWarnings`
só compara no Bradesco, que tem um "Total parcelado" exclusivamente de
parcelamento.

Relacionados: [cartao-credito](cartao-credito.md) · [fatura-bradesco-pdf](fatura-bradesco-pdf.md)
