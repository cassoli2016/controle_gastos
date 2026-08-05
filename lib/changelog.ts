/**
 * Fonte da página /novidades. Linguagem de USUÁRIO (o que a pessoa vê, não o
 * que o código faz). Mais recente no topo. Toda entrega adiciona sua entrada
 * aqui NO MESMO COMMIT do bump de versão do package.json — o teste
 * tests/changelog.test.ts trava esse sincronismo.
 */
export type ChangelogEntry = {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4.0",
    date: "2026-08-05",
    title: "Fechamento de fatura",
    items: [
      "Ao importar a fatura, o que você lançou e o banco não cobrou passa a ir para o mês seguinte sozinho, em vez de desaparecer.",
      "Parcela que o banco atrasou desloca o plano inteiro: as seguintes descem um mês e o plano termina um mês depois.",
      "Dá para dar baixa da fatura já na importação, informando a data do pagamento.",
      "O preview mostra quanto cada mês vira e quantas linhas entram e saem, antes de você confirmar.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-05",
    title: "Fatura fechada pelo Telegram",
    items: [
      "Mande o PDF da fatura fechada do Nubank ou do Bradesco no Telegram: o bot confere se o total bate com o que o app tem no mês. Se não bater, ele diz de quanto é a diferença.",
      "A tela de Cartões passou a aceitar a fatura do Nubank em PDF, e o preview agora mostra o impacto mês a mês antes de você confirmar.",
      "Corrigido: importar o CSV de uma fatura não apaga mais os lançamentos de uma fatura já fechada.",
      "Corrigido: parcelas quitadas antecipadamente não aparecem mais em dobro nos meses futuros.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-08-05",
    title: "Fatura do Nubank conferida com o banco",
    items: [
      "A fatura de agosto do Nubank agora bate exatamente com o valor fechado pelo banco: um estorno da Shopee estava descontado duas vezes.",
      "As compras do dia do fechamento que o banco jogou para a fatura de setembro entraram no mês certo.",
      "O vencimento do cartão foi corrigido para o dia 12 — o fluxo de caixa do mês mostra a saída no dia real.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-04",
    title: "Fluxo de caixa por dia",
    items: [
      "A tela do Mês ganhou o saldo acumulado dia a dia: o que já aconteceu entra pela data real e o que falta, pela data de vencimento.",
      "O cabeçalho do card avisa na hora se o mês fica no vermelho e qual é o pior dia; toque para abrir o gráfico completo.",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-08-04",
    title: "Ajustes de manutenção",
    items: [
      "O rodapé do computador agora indica o atalho para as Novidades, como no celular.",
      "Arrumação interna: normalização de texto unificada e proteção de rota reforçada.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-04",
    title: "Busca no Mês, Novidades e comparativo nos investimentos",
    items: [
      "Busca de contas na tela do Mês: digite parte do nome e veja só o que interessa, sem rolar a tela.",
      "Depósitos e retiradas da reserva ficam recolhidos num resumo — toque no cabeçalho para ver o detalhe.",
      "Página Novidades (esta aqui): toque na versão no rodapé para ver o que mudou a cada atualização.",
      "Investimentos: coluna Investido ao lado do Valor atual na carteira, e o Dashboard mostra o investido junto do resultado.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-04",
    title: "Seletor de mês e ano",
    items: ["Clique no nome do mês para abrir um calendário e pular direto para qualquer mês e ano."],
  },
  {
    version: "1.0.0",
    date: "2026-08-02",
    title: "Exportação em CSV",
    items: ["Exporte os lançamentos e o extrato de cartão em CSV no Panorama (abre no Excel)."],
  },
  {
    version: "1.0.0",
    date: "2026-08-01",
    title: "Resumo matinal e Panorama mais completo",
    items: [
      "Resumo matinal no Telegram com as contas do dia.",
      "Panorama: totais por ano e opção de ocultar meses já quitados.",
      "Ajustes em como os dividendos entram nas receitas do mês.",
      "Correção na cópia de contas com recorrência semanal.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-31",
    title: "Caixinhas com histórico no mês",
    items: [
      "Depósitos nas caixinhas e contas pagas pela caixinha viram lançamentos no mês — o dinheiro nunca some nem conta duas vezes.",
      "Correções no parcelamento (editar parcela única e compras por foto).",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-30",
    title: "Fatura do Bradesco no app e cartões mais ricos",
    items: [
      "Importação da fatura do cartão Bradesco em PDF.",
      "Tela de Cartões com fatura detalhada e vencimentos.",
      "Bot do Telegram entende foto de comprovante.",
      "Orçamento por categoria e melhorias na visualização do mês.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-25",
    title: "Fatura pelo vencimento e reserva diária",
    items: [
      "Compras de cartão caem no mês do vencimento da fatura, como no banco.",
      "Reserva do dia a dia: um valor por dia que decai sozinho e pesa no que falta pagar.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-20",
    title: "Panorama e atalhos",
    items: [
      "Panorama: todos os meses lado a lado, com edição direto na célula.",
      "Copiar as contas do mesmo mês do ano anterior.",
      "Bot do Telegram entende o SMS de compra do cartão Bradesco.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-19",
    title: "Investimentos",
    items: [
      "Carteira de ações com cotações automáticas diárias, dividendos e importação dos relatórios da B3.",
      "Fechamento diário da carteira no Telegram.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-17",
    title: "Lançamento do Grana",
    items: [
      "Contas do mês com receitas, despesas, categorias e baixa de pagamento.",
      "Reservas (caixinhas), itens fixos e acesso protegido por senha.",
    ],
  },
];
