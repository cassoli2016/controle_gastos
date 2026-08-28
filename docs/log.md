---
type: Log
---
2026-07-17 — initialized OKF knowledge base
2026-07-17 — mapeados 7 domínios de dados a partir de `Contas Mensais.xlsx` (contas fixas, investimentos, dividendos, financiamento, NFs, IPVA, cartão)
2026-07-30 — added Fatura Bradesco (PDF Bradescard/Amazon): layout e regras de importação
2026-08-04 — added métricas Saldo (previsto do mês) e Saldo a realizar: fórmulas e diferença entre Mês/Dashboard e Panorama
2026-08-05 — added Fatura Nubank (PDF fechado + CSV aberto): layout, competência e o corte intradiário que parte o dia do fechamento entre duas faturas
2026-08-05 — added parser da fatura Nubank e importação de fatura em PDF pelo Telegram; cronograma de parcelas passa a agrupar por plano (quitação antecipada duplicava)
2026-08-05 — added fechamento de fatura como estado dos planos: órfãs caminham para frente, cauda reconciliada por plano, dívida da duplicação resolvida sem limpeza em produção
2026-08-05 — produção: coluna CardTransaction.bankDescription (nullable) e backfill de 230 linhas do Bradesco com o texto do banco; nenhum valor de lançamento alterado
2026-08-05 — added sobra realizada do mês (recebido − pago) como métrica própria: nem plannedBalance (ignora baixa) nem saldo a realizar (é o oposto); usada no depósito em caixinha e no comando "reserva" do bot
2026-08-06 — added CardSubscription.bankDescription: nome fantasia (tela) separado do texto da fatura (casamento). O nome fantasia como chave falhava — "YouTube Premium" não está contido em "Google Youtubepremium"
2026-08-06 — npm overrides escopado em next-auth para @simplewebauthn: o next-auth beta declara peer OPCIONAL em ^9 e nós usamos ^13 num fluxo próprio (não o provider dele). Sem o override, `npm ci` falha com ERESOLVE e o deploy quebra
2026-08-28 — a B3 chama de "Reembolso" o provento de ação alugada (BTC): quem tomou emprestado devolve o dividendo/JSCP ao doador. Vem como "Reembolso" no extrato de pagos e "Reembolso - DIVIDENDO" nos provisionados — o importador só conhecia "Dividendo"/"JSCP" e pulava essas linhas em silêncio
2026-08-28 — casamento de provento com a agenda (lib/dividend-match.ts) passa a exigir data próxima (±15 dias), valor exato antes de aproximado e um pendente por provento: casar só por valor ±2% fazia RECV3 (477,85 em 2026/2027/2028) virar cadeira-musical e as parcelas de JSCP da CMIG4 (8,87 x 8,98) se engolirem
