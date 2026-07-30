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

Relacionados: [cartao-credito](cartao-credito.md)
