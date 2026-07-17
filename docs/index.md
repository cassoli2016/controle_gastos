---
type: Index
title: Controle de Gastos Particular — Knowledge Base
description: Referência central de todo o conhecimento do projeto (modelo de dados, métricas e serviços).
timestamp: 2026-07-17
---

# Controle de Gastos Particular

Aplicação de controle financeiro pessoal, baseada na planilha `Contas Mensais.xlsx`.
Projeto greenfield — stack a definir em brainstorming. **Alvo de deploy: Vercel** (favorece Next.js).

## Tables / Data

Domínios de dados derivados das 7 abas da planilha de origem. Cada item pode ser
expandido em um arquivo de conceito próprio via `/mega-brain:migrate` ou `/mega-brain:ingest`.

- [contas-fixas](contas-fixas.md) — matriz de receitas/despesas fixas mês a mês (dia de pgto, valor por competência, total, rank), com projeção plurianual
- [investimentos](investimentos.md) — carteira de ações: ativo, segmento, cotas, preço médio, % carteira, investido vs. atual, resultado
- [dividendos](dividendos.md) — proventos por ativo: tipo, data com, data pagamento, valor, líquido, status e agregação por mês/ano
- [financiamento-carro](financiamento-carro.md) — dados do financiamento do veículo (valores da NF, valor final, parcela, contrato)
- [nfs-emitidas](nfs-emitidas.md) — histórico de notas fiscais emitidas por ano (2019→presente)
- [ipva](ipva.md) — IPVA e licenciamento por veículo (identificadores mascarados)
- [cartao-credito](cartao-credito.md) — compras parceladas do cartão distribuídas por competência

## Metrics

<!-- Métricas derivadas a documentar conforme forem definidas na aplicação. Ex.: -->
<!-- [saldo-mensal](saldo-mensal.md) — receitas - despesas por competência -->
<!-- [yield-carteira](yield-carteira.md) — dividendos / valor investido -->

## APIs

<!-- Endpoints da aplicação, a definir após o design da stack. -->

## Services

<!-- Serviços/módulos da aplicação, a definir após o design da stack. -->
