---
type: Formato de Importação
title: Fatura Bradesco (PDF Bradescard/Amazon)
description: Layout do PDF de fatura mensal do cartão Bradesco Amazon e regras para transcrever os lançamentos para o app.
tags: [cartao, bradesco, fatura, importacao, pdf]
timestamp: 2026-07-30
---

# Fatura Bradesco — modelo do PDF (Bradescard / Amazon Mastercard)

Modelo observado na fatura fechada em 27/07/2026 (vencimento 10/08/2026). O PDF tem
3 páginas; só a página 2 tem os lançamentos. **O PDF contém PII (CPF, endereço,
número mascarado do cartão) — nunca commitar o arquivo no repositório.**

## Estrutura das páginas

| Página | Conteúdo |
|--------|----------|
| 1 | Cabeçalho (nome, cartão mascarado `NNNN.NN**.****.NNNN`), **Total da fatura**, **Vencimento**, limites, "previsão de fechamento da próxima fatura", opções de pagamento/parcelamento, **Resumo da fatura**, boletos |
| 2 | **Lançamentos** (a lista de compras), total parcelado para próximas faturas, limites, encargos |
| 3 | Planos de parcelamento da fatura (ignorar) |

## Resumo da fatura (página 1) — validação

```
Saldo anterior            (fatura passada)
(-) Créditos/Pagamentos   (pagamento recebido + estornos)
(+) Compras/Débitos       (soma das compras positivas)
(=) Total                 (= Total da fatura)
```

Conferência dupla: soma das linhas positivas da página 2 = Compras/Débitos;
soma líquida (positivas + estornos, sem "pagamento recebido") = Total da fatura.
Na fatura-modelo: 1.492,25 de compras − 363,93 de estorno = **1.128,32** ✓.

## Lançamentos (página 2)

Formato de cada linha: `dd/mm  DESCRIÇÃO CIDADE(pp/tt)  valor`

- **Data `dd/mm` sem ano** — é a data da COMPRA original, não da parcela.
  Inferência do ano: mês da linha > mês do fechamento → ano anterior
  (ex.: fatura fechando 07/2026 com linha `21/11` → 2025-11-21).
- **Marcador `(pp/tt)`** colado na cidade = parcela `pp` de `tt` (ex.: `(09/12)`).
  Compra à vista costuma vir `(01/01)` ou sem marcador. Cada fatura lista SÓ a
  parcela corrente — parcelas futuras aparecem nas próximas faturas.
- **`PAGAMENTO RECEBIDO - OBRIGADO`** (valor com sufixo `-`): pagamento da fatura
  anterior. É a ÚNICA linha que fica de fora da importação (mesma regra do CSV
  Nubank em `lib/csv-import.ts`).
- **Estorno**: valor com sufixo `-` (ex.: `363,93-`). ENTRA como linha negativa.
- Valores em formato brasileiro (`1.031,53`); negativos com `-` APÓS o número.

## Como importar para o app

1. Competência: o cartão fecha dia 27 e vence dia 10 → fatura fechada em julho é
   competência AGOSTO (`faturaMonth` em `lib/fatura.ts`: vencimento ≤ fechamento
   ⇒ mês seguinte ao do fechamento).
2. Transcrever as linhas (descrição verbatim, incluindo `(pp/tt)`), validar a soma
   contra o Total da fatura e usar `replaceCardMonth` (`lib/card-entry.ts`) —
   idempotente: substitui extrato + consolidado do mês, preservando antecipações.
3. Exemplo/gabarito: `scripts/fix-fatura-ago-bradesco.ts` (primeira importação
   real, ago/2026).
4. Meses seguintes: cada linha "(pp/tt)" implica parcelas pp+1..tt nas próximas
   faturas com o mesmo valor — validar contra o "Total parcelado para as
   próximas faturas" da página 2 (tolerância de poucos reais: o Bradesco ajusta
   centavos nas parcelas finais). Compras com data APÓS o fechamento pertencem
   ao ciclo novo e não podem ser apagadas na reconstrução. Estorno de compra
   parcelada cancela o plano inteiro (sem parcelas futuras). Gabarito:
   `scripts/fix-faturas-futuras-bradesco.ts`.

5. **Compra do ciclo novo já lançada:** o aviso do banco traz o nome CURTO da loja
   (`AMAZON BR`) e você lança a parcela por divisão do total (435,90 ÷ 10 = 43,59);
   a fatura traz o nome do seller com cidade (`AMAZONMKTPLC*RETLAWCOM SAO PAULO`) e
   o valor real da parcela (43,61). São a mesma compra — `findOrphans` casa isso no
   3º passe por (nº de parcelas, parcela, valor ±10 centavos). Sem ele a parcela já
   cobrada virava "parcela atrasada" e a cauda dobrava (medido: R$ 3.372,61 em 86
   linhas na fatura de 27/08/2026).

Relacionados: [cartao-credito](cartao-credito.md)

---

# Extrato EM ABERTO (app Bradesco Cartões) — a "fatura parcial"

Documento DIFERENTE da fatura fechada acima, gerado pelo app antes do
fechamento do ciclo. Modelo observado: gerado em 13/09/2026 15:51, 2 páginas.
Parser em `lib/bradesco-extrato.ts`; a fatura fechada segue em
`lib/bradesco-fatura.ts` e não foi tocada.

## Como reconhecer

Duas âncoras juntas: `Situação do Extrato: EM ABERTO` e `Aplicativo Bradesco
Cartões`. `detectFaturaBank` devolve null de propósito quando elas aparecem —
este documento NÃO pode entrar na importação da tela de Cartões.

## O que muda em relação à fatura fechada

| | Fatura fechada | Extrato em aberto |
|---|---|---|
| Total | `Total da fatura R$` | `Total da Fatura em Real . . . R$ 980,81` |
| Vencimento | `Vencimento 10/08/2026` | **não existe** |
| Resumo (saldo/créditos/compras) | existe | **não existe** |
| Limite | `Limite de compras R$` | **não existe** |
| Parcela | `(09/12)` | `9/14` — sem parênteses, sem zero à esquerda |
| Negativo | `1.453,59-` (sinal depois) | `-1.453,59` (sinal antes) |
| Linha | `dd/mm DESC valor` | `dd/mm DESC 000 0,00 0,00 R$ 0,00 valor` |
| Cidade | `SAO PAULO` | truncada em `SA` |
| Quebra de linha | rara | frequente, e a data cai ora na 1ª, ora na 2ª linha |

## Competência

Não há vencimento para derivar dela. A competência sai da **data de geração**
(cabeçalho `Data: dd/mm/aaaa`) + o ciclo do cartão, por `faturaMonth`
(`lib/fatura.ts`): gerado 13/09 com fechamento 27 e vencimento 10 → o ciclo
fecha 27/09, vence 10/10 → competência **outubro**. O mesmo número serve de base
para inferir o ano das linhas `dd/mm`: mês da linha > mês da geração → ano
anterior. Por isso o parser devolve `generatedISO` e não `faturaMonth` — quem
conhece o cartão é o chamador.

## A lista é PARCIAL — e auto-consistente

Medido no extrato de 13/09/2026: **26 linhas contra 50** que o app tinha na
mesma competência, e mesmo assim a soma das 26 fechava exatamente com o
`Total da Fatura em Real` declarado (R$ 980,81). Ou seja: o documento é
auto-consistente sem ser completo, e **a soma não serve de prova de
completude**. Por isso o parser nunca aborta por divergência de soma (a fatura
fechada aborta, e deve continuar abortando).

O `Total para <titular>` (R$ 508,03 no modelo) **não deriva das linhas
listadas** e continua sem explicação — é lido para diagnóstico
(`holderTotalCents`) e nada depende dele.

## Conferência ADITIVA (`lib/extrato-confere.ts`)

Como a lista é parcial, "a soma tem que bater" daria divergência todo mês. O
sinal útil é só o que o BANCO tem e o app NÃO — compra que falta lançar:

- **`faltando`**: linha do extrato sem par no app, com a cauda que implica
  (`(count − seq + 1) × valor` = tudo que ainda falta pagar do plano)
- **`naoMostradas`**: linha do app fora do extrato — informativo, esperado
- **`centavos`**: pares que casaram com valor diferente (o banco redistribui o
  arredondamento entre as parcelas)

O casamento não tenta reconstruir a cidade truncada: compara o nome sem o
marcador de parcela com `descriptionsMatch` (uma descrição contida na outra),
o que resolve `AMAZON BR SA` × `AMAZON BR SAO PAULO(02/05)` sem inventar texto.
Exige mesma parcela e valor dentro de `CENTS_TOLERANCE`; o 2º passe dispensa o
nome mas só aceita candidato ÚNICO.

## Limite

O extrato **não traz limite algum**. O "limite utilizado" da tela inicial do
banco chega pela legenda do PDF no Telegram (`usado 12.325,63`) e é comparado
com a dívida que o app projeta (soma de `CardTransaction` da competência em
diante). Medido em 13/09/2026: app R$ 11.821,76 × banco R$ 12.325,63 →
diferença R$ 503,87, explicada pelas 3 compras faltando (R$ 683,16 de cauda)
menos o que ainda não foi comprado.
