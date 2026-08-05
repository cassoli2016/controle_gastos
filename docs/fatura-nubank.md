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

## Como importar para o app

1. Fatura aberta: usar a importação de CSV da tela **Cartões**
   (`replaceCardMonth` em `lib/card-entry.ts`) — idempotente, substitui extrato +
   consolidado do mês e preserva antecipações.
2. Fatura fechada: validar o extrato do mês contra o "Total a pagar" pela fórmula
   acima antes de gravar. Gabarito: `scripts/fix-fatura-nubank-ago-2026.ts`
   (simula por padrão, grava só com `--apply`, e aborta se a projeção não fechar
   nos centavos).
3. Meses seguintes: cada `- Parcela pp/tt` implica `pp+1..tt` nas próximas
   faturas com o mesmo valor — validar contra "Saldo em aberto total" da
   página 4. Gabarito da mesma ideia no Bradesco:
   `scripts/fix-faturas-futuras-bradesco.ts`.

Relacionados: [cartao-credito](cartao-credito.md) · [fatura-bradesco-pdf](fatura-bradesco-pdf.md)
