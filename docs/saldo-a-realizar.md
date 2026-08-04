---
type: Metric
title: Saldo a realizar
description: O que ainda falta acontecer no mês — valores a receber menos valores a pagar, considerando apenas lançamentos ainda não baixados.
tags: [saldo, panorama, metricas]
timestamp: 2026-08-04
---

# Saldo a realizar

Linha de rodapé da matriz do **Panorama** (`/panorama`), junto com "A receber" e "A pagar".

## Fórmula

`buildMatrix` em `lib/matrix.ts`:

```
remaining(lançamento) = paid ? 0 : plannedCents      // baixado zera
toReceive[m] = Σ remaining (receitas do mês m)
toPay[m]     = Σ remaining (despesas do mês m)
saldoARealizar[m] = toReceive[m] − toPay[m]
```

- Cada baixa (pagar/receber) **zera** o lançamento nesta métrica — o número caminha para **zero** conforme o mês é quitado.
- `paid` é binário por lançamento; não existe baixa parcial.
- Colunas de ano e TOTAL somam os meses visíveis da matriz.
- Inclui uma linha de "reserva do dia a dia" por mês exibido (`paid: false`, valor decaindo no mês corrente, zero no passado).

## Interpretação

"Do que está em aberto, quanto sobra?" É o saldo do **restante** do mês, não do mês inteiro — o cabeçalho do Panorama avisa: "valores = o que ainda falta".

## Relação com outras métricas

- [Saldo (previsto do mês)](saldo-previsto.md) usa o previsto de tudo, pago ou não. `saldoPrevisto − saldoARealizar = recebido − pago` (líquido já realizado).
- Exemplo (ago/2026): previsto 52.603,86 − 48.581,00 = **4.022,86** (Mês); em aberto 50.895,43 − 47.693,67 = **3.201,76** (Panorama); diferença 821,10 = 1.708,43 recebidos − 887,33 pagos.
