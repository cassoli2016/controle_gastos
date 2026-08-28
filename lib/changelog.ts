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
    version: "1.14.1",
    date: "2026-08-28",
    title: "Proventos da B3 que sumiam da agenda",
    items: [
      "Provento de ação alugada agora entra. Quando alguém aluga seus papéis, a B3 não escreve \"Dividendo\" — escreve \"Reembolso\", porque quem alugou é que devolve o provento a você. O importador não conhecia esse nome e pulava a linha calado: era o caso de ALOS3 e BBSE3.",
      "A agenda parou de embaralhar provento de valor repetido. O casamento olhava só o valor (±2%) e ignorava a data — como RECV3 anuncia R$ 477,85 para 31/12 de 2026, 2027 e 2028, cada linha \"corrigia\" a data da outra e a de 2026 desaparecia. Agora a data também conta, e cada anúncio casa com um provento só.",
      "Parcelas de valor parecido no mesmo dia pararam de se engolir: os JSCP de R$ 8,87 e R$ 8,98 da CMIG4 têm 11 centavos de diferença, cabiam nos 2% e contavam como um.",
      "Sua agenda foi corrigida com a planilha de 27/08: entraram ALOS3 de 02/09 (R$ 291,91 e R$ 59,54), BBSE3 de 03/09 (R$ 1.586,61 e R$ 2.181,61, no lugar da linha que estava somada à mão) e RECV3 de 31/12/2026 (R$ 477,85); saíram as duplicatas de CMIG4 e RECV3.",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-08-15",
    title: "Seguro anual parcelado se renova sozinho",
    items: [
      "A renovação parcelada de um item (seguro em 4x, por exemplo) agora provisiona TODAS as renovações até o último mês que você já tem lançado — quem planeja 2028 vê o seguro de 2028 hoje, sem depender do botão de copiar.",
      "O \"Copiar mês anterior\" parou de arrastar parcelas de renovação para o mês seguinte — as linhas dessas contas nascem da provisão, no mês certo de cada ano.",
      "Seguro C3 e Seguro Duster foram convertidos para esse formato: os lançamentos de 2027 continuam onde estão e as parcelas de 2028 entram automaticamente.",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-08-15",
    title: "Excluir contas direto pelo Panorama",
    items: [
      "Clique numa célula do Panorama e, além de editar e dar baixa, agora dá para excluir: \"Excluir mês\" apaga o lançamento daquele mês; \"Excluir em diante\" encerra a conta dali até o fim do horizonte.",
      "O \"em diante\" só apaga o que está em aberto — lançamentos já pagos ficam, são o seu histórico. Tudo com confirmação antes, porque exclusão não tem volta.",
    ],
  },
  {
    version: "1.12.1",
    date: "2026-08-15",
    title: "Cópia do ano passado avisa quem ficou de fora",
    items: [
      "O \"Copiar mês do ano passado\" continua não trazendo contas arquivadas — mas agora avisa: o aviso de sucesso lista quais contas ficaram de fora por estarem arquivadas, em vez de sumir com elas em silêncio.",
      "Se uma dessas contas ainda existe de verdade, reative-a na tela Itens e copie de novo.",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-08-15",
    title: "Valor novo aplicado aos meses seguintes",
    items: [
      "A conta subiu de preço? Ao editar o valor previsto na tela do Mês, marque \"Aplicar aos meses seguintes já lançados\" — todos os lançamentos futuros daquela conta que já existem sobem para o valor novo de uma vez (a academia que reajustou, por exemplo).",
      "Só mexe no que está em aberto: lançamentos já pagos ficam como estão, e meses ainda não criados continuam por conta do provisionamento (que copia o valor novo dali em diante).",
    ],
  },
  {
    version: "1.11.2",
    date: "2026-08-08",
    title: "Ocultar pagos também esconde o que não tem valor no mês",
    items: [
      "Com o \"Ocultar pagos\" ligado, contas sem nenhum valor até o mês atual — as que só existem em meses futuros — também somem. O que sobra é exatamente o que ainda mexe no seu mês: em aberto agora ou atrasado.",
    ],
  },
  {
    version: "1.11.1",
    date: "2026-08-08",
    title: "Ocultar pagos do Panorama olha o mês atual",
    items: [
      "O \"Ocultar pagos\" do Panorama agora esconde a conta que não tem mais nada em aberto ATÉ o mês atual — mesmo que ela tenha provisão até o fim do ano. Antes, a linha só sumia se estivesse paga em todos os meses, o que na prática não escondia quase nada.",
      "Conta atrasada de mês passado continua aparecendo, e conta que só começa no futuro também — ela não está paga, está por vir.",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-08-07",
    title: "Compra sem nome de cartão vai para o padrão",
    items: [
      "\"mercado 250\" no bot agora cai direto na fatura do cartão padrão (⭐ Nubank) — sem digitar o nome. O SMS do Bradesco continua indo para o Bradesco, porque ele já traz o cartão.",
      "Compra que NÃO foi no cartão: termine com pix, débito, dinheiro ou avulso — \"mercado 250 pix\" fica fora da fatura, como antes.",
      "Compartilhamento do Nubank que vier sem a linha do cartão também cai no padrão, em vez de virar lançamento solto.",
      "Recorrências e recebimentos não mudam: conta fixa não é compra de cartão.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-08-07",
    title: "Estorno pelo bot e cartão padrão",
    items: [
      "Estorno de compra pelo Telegram: \"estorno 56,71 shopee\". Estorno de IOF: \"estorno iof 0,55\". O valor abate a fatura em aberto na hora.",
      "Cartão padrão (estrela no cadastro, em Cartões): comandos sem nome de cartão — estorno e antecipação — caem nele. O Nubank já está marcado.",
      "Quando a fatura fechada chegar, o estorno lançado à mão casa pelo valor com o crédito do banco — não duplica nem muda de mês.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-08-07",
    title: "Ocultar contas pagas no Panorama",
    items: [
      "O Panorama ganhou o botão \"Ocultar pagos\": some com as linhas já quitadas nos meses visíveis e deixa só o que ainda mexe no bolso. Categoria que fica vazia sai junto.",
      "Como na tela do Mês, esconder não muda nenhum número — os totais por mês e o rodapé (A receber, A pagar, Saldo a realizar) continuam contando tudo.",
      "Os dois filtros do Panorama (pagos e meses quitados) funcionam juntos e ficam na URL, então a preferência não se perde ao navegar.",
    ],
  },
  {
    version: "1.8.4",
    date: "2026-08-07",
    title: "Tag de despesa com cor",
    items: [
      "A tag \"Despesa\" ganhou o mesmo tom rosa do card de Despesas — no Mês, no Panorama e em Categorias. Vermelho é gasto em qualquer canto do app.",
    ],
  },
  {
    version: "1.8.3",
    date: "2026-08-07",
    title: "Desativar assinatura não apaga mais nada",
    items: [
      "Desativar uma assinatura agora só desliga o vínculo com o cartão: as linhas dos meses — passadas e futuras — ficam onde estão. Antes, desativar apagava as provisões futuras e desativava a conta, sem avisar.",
      "Recadastrar uma assinatura desativada volta a funcionar: o cadastro reativa o vínculo em vez de recusar.",
      "Atenção: com a assinatura desativada, a cobrança na fatura deixa de dar baixa automática na linha do mês — a conta volta a contar duas vezes quando a fatura chegar.",
    ],
  },
  {
    version: "1.8.2",
    date: "2026-08-07",
    title: "Conferir o Face ID na hora",
    items: [
      "Depois de registrar o aparelho, o app fica destravado por 30 minutos — então não dava para saber se a trava funcionou. Agora tem um botão \"Trancar agora\" em Ajustes para testar na hora.",
    ],
  },
  {
    version: "1.8.1",
    date: "2026-08-06",
    title: "Ajustes no menu",
    items: [
      "A página de Ajustes agora tem entrada: o ícone de engrenagem no topo, e também no menu lateral do celular. Ela existia desde a versão anterior mas não dava para chegar nela.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-08-06",
    title: "Face ID para abrir o app",
    items: [
      "Em Ajustes você registra o aparelho e o app passa a pedir Face ID ao abrir. A senha continua funcionando como saída — se trocar de celular, você entra por ela e registra de novo.",
      "A trava vale por 30 minutos: abrir o app de novo logo em seguida não pede biometria toda hora.",
      "O nome da assinatura como aparece na fatura agora pode ser editado depois de cadastrada, direto na lista de Assinaturas do cartão.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-08-06",
    title: "Assinatura com nome próprio e nome da fatura",
    items: [
      "Ao cadastrar uma assinatura você agora informa dois nomes: o que quer ver na tela e o que o banco escreve na fatura. É pelo segundo que a cobrança é reconhecida — sem ele, contas como \"YouTube Premium\" x \"Google Youtubepremium\" contavam duas vezes no mês.",
      "Assinatura de uma conta que você já tinha cadastrada como conta fixa passou a funcionar: antes o app recusava, e a conta ficava contando dobrado com a fatura.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-08-06",
    title: "Ocultar contas pagas no mês",
    items: [
      "Botão \"Ocultar pagas\" na tela do Mês: some com o que já foi quitado e deixa só o que falta. A preferência fica na URL, então continua valendo quando você troca de mês.",
      "Esconder não muda nada nos números: o subtotal de cada categoria e o contador \"3/5 pagos\" continuam contando tudo.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-08-05",
    title: "Caixinha pelo Telegram e a sobra do mês",
    items: [
      "O bot passou a entender caixinha: mande \"reserva\" para ver os saldos e quanto sobrou no mês, ou \"reserva 3000 emergência\" para guardar.",
      "Ao depositar numa caixinha, o app agora diz quanto sobrou de fato no mês — o que entrou menos o que saiu, contando só o que já foi baixado — e já sugere esse valor. Você muda se quiser guardar só parte.",
      "A importação de fatura ficou muito mais rápida: uma fatura grande passava de um minuto e agora leva segundos.",
      "Renomear uma linha do cartão para um nome mais legível não bagunça mais a importação da fatura seguinte.",
    ],
  },
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
