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
    version: "1.46.2",
    date: "2026-10-28",
    title: "Fatura do Bradesco sem parcelas em dobro",
    items: [
      "Compra parcelada lançada pelo aviso do banco (\"AMAZON BR\") e a mesma compra na fatura (\"AMAZON BR SAO PAULO\") agora são reconhecidas como uma só. Antes, ao importar a fatura, as parcelas dos meses seguintes podiam aparecer duas vezes e inflar as próximas faturas.",
    ],
  },
  {
    version: "1.46.1",
    date: "2026-10-26",
    title: "Cópias do app sempre em dia com a versão nova",
    items: [
      "Quando sai uma versão nova, cada cópia do app prepara os próprios dados sozinha na hora de atualizar. Antes, uma cópia podia receber a tela nova sem os dados prontos e dar erro até alguém ajustar à mão.",
    ],
  },
  {
    version: "1.46.0",
    date: "2026-10-21",
    title: "Extrato do mês em PDF, seis meses por categoria e o saldo livre no bom-dia",
    items: [
      "Em Mais ações do Mês, \"Extrato em PDF\" abre uma página limpa com os números do mês e todas as contas por categoria, com a data de pagamento. Imprima ou salve em PDF; no celular, pelo Compartilhar.",
      "Categorias mostra os últimos seis meses de cada uma em barrinhas, com o mês atual em destaque. Dá para ver se um gasto está subindo sem abrir o Dashboard.",
      "O resumo matinal do Telegram ganhou uma linha com o saldo livre: o que sobra das caixinhas depois dos meses no vermelho.",
    ],
  },
  {
    version: "1.45.0",
    date: "2026-10-21",
    title: "Patrimônio real ao lado da projeção",
    items: [
      "O gráfico de patrimônio ganhou a linha do que aconteceu de verdade. Todo dia o app registra caixinhas mais carteira; a foto de cada mês vira um ponto na linha escura, ao lado da projeção em roxo e da tendência em âmbar. Comece pelo botão \"Registrar hoje\" no card; daí em diante é automático, junto com a atualização das cotações.",
    ],
  },
  {
    version: "1.44.0",
    date: "2026-10-21",
    title: "Meta que é mínimo, busca rápida e o resumo fixo do Mês no celular",
    items: [
      "Ao editar uma categoria, marque \"a meta é um mínimo\" para o que você quer investir ou guardar. Passar dela fica verde no Orçamento do mês e em Categorias; ficar aquém fica âmbar. Desmarcado, a meta continua sendo um teto.",
      "Busca rápida: a lupa no topo, ou Ctrl+K e ⌘K, abre uma caixa para pular para qualquer tela, mês ou conta pelo nome, com as setas e Enter.",
      "No celular, o Mês ganhou uma barra fixa logo acima da navegação com o que falta pagar e a próxima conta a vencer, atrasada primeiro.",
    ],
  },
  {
    version: "1.43.0",
    date: "2026-10-21",
    title: "Metas nas caixinhas e um Panorama que cabe no celular",
    items: [
      "Cada caixinha pode ter uma meta: quanto você quer juntar e até quando. O card mostra a barra de progresso, quanto falta e quanto guardar por mês para chegar lá no prazo. É opcional, em Nova caixinha ou Editar.",
      "Panorama: a coluna das contas ficou mais estreita no celular e a tabela usa letra menor, então cabem mais meses na tela. A frase de instruções encolheu, as seções perderam a etiqueta Receita/Despesa (o total em verde diz que é entrada) e a coluna Total deixou a caixa alta.",
      "Categorias de transferência, como o depósito e a retirada de caixinha, aparecem com a etiqueta \"transferência\" em vez de Despesa ou Receita.",
      "Novidades mostra as seis versões mais recentes e guarda as anteriores atrás de um clique.",
    ],
  },
  {
    version: "1.42.1",
    date: "2026-10-20",
    title: "Proventos de ações vendidas voltam ao total a receber",
    items: [
      "Quem tinha a ação na data-com recebe o provento mesmo vendendo depois. A versão anterior tirava esses proventos do total e os escondia numa lista recolhida; agora eles contam e aparecem na lista normal, só com a marca \"ação vendida\" ao lado do ticker.",
    ],
  },
  {
    version: "1.42.0",
    date: "2026-10-20",
    title: "Itens com valor, categorias com gasto e meta, caixinhas com vida",
    items: [
      "Itens: cada conta mostra o valor previsto no mês (ou o do próximo mês em que cai, para as bimestrais e anuais), quando vence e a cadência. No alto, quanto as contas ativas somam no mês em despesas e em receitas.",
      "Categorias: ao lado de cada uma, o total movimentado no mês e a meta mensal com a barra de uso. O botão de excluir virou um ícone discreto; a confirmação continua em vermelho.",
      "Reservas: cada caixinha mostra a fatia do total guardado e o último movimento, e as ações ganharam nome (Depositar, Retirar). Se o extrato não bater com o saldo, a caixinha avisa.",
      "Investimentos: proventos previstos de ações que você já vendeu saíram do total a receber e foram para uma lista recolhida, de onde dá para apagá-los.",
      "Ajustes virou um lugar de verdade: segurança, exportação dos seus dados em CSV (que estava escondida no Panorama) e um mapa de onde cada coisa se configura.",
    ],
  },
  {
    version: "1.41.0",
    date: "2026-10-20",
    title: "Dashboard reorganizado: o Horizonte mostra o ano de relance",
    items: [
      "O Dashboard abre com o Horizonte: uma faixa dos próximos 12 meses, cada mês com uma barra que sobe quando sobra e desce quando falta, o saldo livre ao lado e, embaixo, a frase que resume (quantos meses fecham no vermelho e qual é o mais apertado), o plano e a tendência. Tocar num mês abre o Mês. No mês atual entra só o que ainda falta acontecer.",
      "O resto do Dashboard ficou em três bandas, na ordem de leitura: Agora (os números do mês, o saldo com as quatro pontas e os cartões, com a fatura em formação e as próximas faturas num bloco só), O que vem (reservas e saldo livre, meses no vermelho com as renovações, carteira) e Análise (os gráficos). Saíram as repetições: meses no vermelho e próximas faturas apareciam duas vezes, e Renovações ocupava meia linha para dizer \"nenhuma\".",
      "Valores em dinheiro ganharam tipografia de extrato em todo o app: o símbolo menor e mais leve, os dígitos em destaque e o sinal de menos tipográfico.",
      "Cartões: a barra embaixo da fatura ganhou nome, Limite usado, e a fatura seguinte aparece ao lado da fatura do mês, medida contra o teto do cartão.",
      "Mês: a coluna Dia mostra sempre dia/mês, os grupos perderam a etiqueta Receita/Despesa (o total em verde diz que é entrada), o saldo do mês virou o quarto número da faixa e os botões que viviam perdidos no fim da página (conta fixa no mês e valor em lote) subiram para as ações do mês. No celular, as ações abertas ficam numa grade de duas colunas.",
      "Gráficos no mesmo padrão: grade em filete fino, barras finas com ponta arredondada, dica de valor em caixa de papel, e a rosca de categorias junta as fatias menores em \"Outras\". O menu lateral ficou agrupado: Dia a dia, Dinheiro, Cadastros e Ferramentas.",
    ],
  },
  {
    version: "1.40.0",
    date: "2026-10-20",
    title: "Mês no celular: cada linha com a mesma geometria",
    items: [
      "Na lista do Mês, no celular, toda linha ficou igual: nome e etiquetas à esquerda, valor à direita; embaixo, o dia, a situação (Pagar, ou a data e o desfazer) e um único botão \"⋯\" na borda com as demais ações. Antes cada tipo de linha trazia dois, três ou cinco ícones, e os valores alinhavam ora com um lápis ao lado, ora sem.",
      "Os três números do mês viraram linhas de extrato no celular, com os valores alinhados numa coluna só. Ocupavam meia tela antes de o primeiro lançamento aparecer.",
      "Os botões Compra e Recebimento ficaram numa linha só, com o \"⋯\" das outras ações na ponta, em vez de um botão de texto sozinho na linha de baixo.",
      "O contador dos grupos mostra só os números no celular, para o nome do grupo não ser cortado. A barra de baixo ganhou rótulos um ponto maiores.",
    ],
  },
  {
    version: "1.39.0",
    date: "2026-10-20",
    title: "Identidade visual: o mês como manchete, uma fonte de extrato e a cor da marca",
    items: [
      "Nas telas do Mês, do Dashboard e de Cartões, o mês virou a manchete: grande, no alto, clicável para escolher outro. O nome da tela ficou como um rótulo discreto acima dele.",
      "Os três números do mês (receitas, despesas, falta pagar) ficam numa faixa só, separados por filetes, sem ícones em quadradinhos coloridos. O mesmo nas faixas de Reservas e de Investimentos.",
      "Nova fonte em todo o app, IBM Plex Sans, com algarismos de largura fixa: os valores alinham em coluna como num extrato.",
      "O azul de botões e destaques deu lugar ao violeta que já estava no logo. Verde, rosa e âmbar continuam significando entrada, saída e aviso.",
      "Rótulos deixaram a caixa alta espaçada. A tela de entrada perdeu os gradientes e as manchas de luz; ficou o essencial.",
    ],
  },
  {
    version: "1.38.1",
    date: "2026-10-20",
    title: "Polimento visual: alinhamentos, etiquetas e destaques",
    items: [
      "Na lista do Mês, a linha paga cabe numa linha só: valor pago, data e \"Desmarcar\" lado a lado, sem dobrar a altura.",
      "Os cards de resumo alinham a barra de progresso na base, mesmo quando o texto de um deles quebra em duas linhas. No celular, o terceiro card ocupa a linha inteira em vez de deixar um buraco ao lado.",
      "A etiqueta \"Receita\" ficou verde, a mesma cor de entrada dos cards; \"Despesa\" segue rosa. Azul fica reservado para botões.",
      "Em Itens e Cartões, \"Ativo\" virou uma etiqueta discreta em verde e \"Arquivar\" deixou de ser vermelho: arquivar é reversível, vermelho é para o que não volta.",
      "Em Cartões, a fatura do mês e a etiqueta \"Paga\" ficam na mesma linha, sem um card dentro do card.",
      "Em Investimentos, o card de resultado mostra o percentual embaixo em vez de cortá-lo; os botões \"Receber\" ficaram discretos.",
      "Em Reservas, os três cards do topo ganharam ícone e as caixinhas mostram o nome inteiro, com os botões numa linha própria.",
    ],
  },
  {
    version: "1.38.0",
    date: "2026-10-20",
    title: "Guardar a sobra quando o dinheiro já está na caixinha",
    items: [
      "O diálogo \"Guardar a sobra\" da tela do Mês e o depósito da tela de Reservas ganharam a opção \"O dinheiro já está na caixinha\". Marque quando você já fez a transferência no banco e já atualizou o saldo: o depósito entra no mês e no extrato da caixinha, e o saldo dela continua o mesmo. É a mesma opção que o \"Fechar o mês\" já tinha.",
      "Sem isso, quem mantém o saldo da caixinha pelo app do banco via o Dashboard insistir que a sobra do mês \"ainda está na conta\", e somar de novo ao registrar.",
    ],
  },
  {
    version: "1.37.0",
    date: "2026-10-20",
    title: "Saldo livre: o que sobra das caixinhas depois dos meses no vermelho",
    items: [
      "O card de Reservas do Dashboard mostra a conta por extenso: o total guardado, a soma dos meses no vermelho daqui para a frente e, destacado, o saldo livre que sobra depois de cobrir todos eles. É o teto para segurar os custos.",
      "É a régua conservadora: trata cada mês no vermelho como se tivesse de ser coberto pelo que existe hoje, sem contar com a sobra dos meses bons. A curva do plano e a tendência continuam logo abaixo, porque respondem outra pergunta.",
      "A tela de Reservas ganhou o mesmo número ao lado do descoberto.",
    ],
  },
  {
    version: "1.36.0",
    date: "2026-10-20",
    title: "Auditoria dos números: tendência real, extrato das caixinhas e cinco correções",
    items: [
      "O card de Reservas e o gráfico de patrimônio ganharam uma segunda curva, a tendência: a mesma projeção, mas com o gasto à vista que de fato passou no cartão nos últimos três ciclos fechados no lugar da reserva do dia a dia. O plano continua lá, com o valor por dia que você escolheu; a tendência diz o que acontece se o ritmo atual continuar. A tela de Reservas mostra a média real por dia ao lado do valor configurado.",
      "O card de Reservas passou a mostrar também o que já sobrou no mês e ainda está na conta, sem ter ido para a caixinha.",
      "A retirada avulsa feita pela tela de Reservas não entrava no extrato da caixinha, embora o saldo caísse: o extrato de uma caixinha divergia sem explicação. Corrigido, e a retirada antiga foi ligada ao extrato.",
      "Quando a cobrança de uma assinatura chega na fatura, a linha provisionada do mês ganha a etiqueta \"Na fatura\" e deixa de registrar valor pago próprio. Antes, a sobra realizada (\"Guardar a sobra\" e \"Fechar o mês\") descontava a mesma cobrança duas vezes: na linha e na fatura paga. As assinaturas ativas foram religadas ao texto que vem na fatura, para a cobrança consumir a linha automaticamente.",
      "Duas compras iguais no mesmo dia e na mesma loja (dois veículos, o mesmo serviço) eram tratadas como uma só, e a cauda de parcelas da segunda nunca era gerada. Agora cada uma tem a própria cauda, e a conferência avisa em vez de acusar duplicata.",
      "No bot, um valor com ponto de milhar e sem centavos (\"1.299\") era lido como um real e trinta. Agora vale mil duzentos e noventa e nove, como se escreve.",
      "Miúdos: conta com vencimento dia 31 num mês de 30 dias vence no dia 30; o mês padrão das telas segue o horário de Brasília, não mais o do servidor; o resumo diário do Telegram chama de \"saldo a realizar\" o que é saldo a realizar.",
    ],
  },
  {
    version: "1.35.0",
    date: "2026-10-19",
    title: "A folga das caixinhas passou a olhar a ordem dos meses",
    items: [
      "O card de Reservas somava todos os meses no vermelho e tratava o total como um buraco único a cobrir. Isso ignora a ordem: a sobra de um mês bom cobre os meses seguintes, e jogar essa sobra fora anunciava um aperto que nunca ia acontecer.",
      "Agora ele projeta a curva: parte do que você tem hoje, soma o saldo de cada mês em ordem, e avisa o ponto mais baixo. Se a curva nunca desce, ele diz isso; se desce, diz em qual mês e quanto resta ali.",
      "A ordem é o ponto inteiro: a sobra de um mês cobre os SEGUINTES, nunca os anteriores. Dinheiro não anda para trás, e somar tudo de uma vez deixaria uma sobra lá de 2029 \"pagar\" um buraco deste novembro.",
      "O card de meses no vermelho continua igual, somando os saldos negativos — ele responde outra pergunta, e continua respondendo a dela.",
    ],
  },
  {
    version: "1.34.1",
    date: "2026-10-19",
    title: "A auditoria parou de acusar compra duplicada onde não havia",
    items: [
      "A conferência que roda sobre os cartões vinha apontando parcelas da Amazon como \"cobradas duas vezes\". Não eram: o nome do estabelecimento se repete em compras diferentes, e a conferência tratava todas como se fossem a mesma compra.",
      "Agora ela identifica cada compra parcelada pelo conjunto que de fato a distingue: estabelecimento, número de parcelas, o mês em que a compra começou, a data da compra e o valor. Com isso, sete compras feitas na mesma loja no mesmo mês passam a ser sete compras, não uma com sete cobranças.",
      "O arredondamento que o banco espalha entre as parcelas deixou de atrapalhar: uma parcela de 59,86 e a seguinte de 59,84 continuam sendo a mesma compra.",
      "A conferência continua acusando duplicata de verdade — foi testada com uma cópia injetada de propósito, e acusou.",
    ],
  },
  {
    version: "1.34.0",
    date: "2026-10-05",
    title: "Conta paga agora diz que está paga",
    items: [
      "Na lista do Mês, a conta já quitada ganhou uma etiqueta verde escrita \"Pago\" ao lado do nome — \"Recebido\", quando é receita. Antes isso só se percebia por ausência: o botão azul de pagar sumia, e você tinha que comparar com as linhas vizinhas para entender o que tinha acontecido.",
      "A linha paga também parou de ficar apagada. O desbotamento existia para tirar do caminho o que já aconteceu, mas atrapalhava a leitura justamente de quem queria conferir o que foi pago. Agora quem diz que a conta está quitada é a etiqueta, não a falta de contraste.",
      "O verde é o mesmo que o Panorama já usa para quitado, então as duas telas falam a mesma língua.",
    ],
  },
  {
    version: "1.33.1",
    date: "2026-10-05",
    title: "A folga das caixinhas parava de bater quando você pagava com elas",
    items: [
      "O card de Reservas diz quanto sobra das caixinhas depois de cobrir os meses no vermelho. Esse número estava descontando o mesmo dinheiro duas vezes: quando você pagava uma conta já prevista tirando da caixinha, a reserva caía — mas o buraco que ela precisava cobrir continuava contando aquela conta inteira, como se ainda estivesse em aberto.",
      "Na prática: pagar uma conta prevista com a caixinha derrubava a sua folga na mesma hora, mesmo sem nada ter mudado de verdade. O dinheiro só tinha trocado de bolso.",
      "Agora os dois lados da conta falam a mesma língua. Pagar uma conta prevista com a caixinha deixa a folga praticamente igual, que é o certo.",
      "O erro valia nos dois sentidos, e a outra metade também foi corrigida: guardar dinheiro na caixinha fazia a folga parecer maior do que era, porque a reserva subia e ninguém descontava que o dinheiro saiu da conta. Por causa disso, um mês em que você guarda bastante pode passar a aparecer entre os meses no vermelho — e deve, porque a conta corrente fica mesmo mais magra naquele mês.",
    ],
  },
  {
    version: "1.33.0",
    date: "2026-10-03",
    title: "O app agora também roda em cópias, uma por pessoa",
    items: [
      "Dá para abrir uma cópia independente deste app para outra pessoa: login e senha próprios, dados completamente separados dos seus — nada que ela lançar aparece no seu mês, e vice-versa.",
      "Cada cópia tem seu próprio nome, exibido na tela de login, no título da aba do navegador e no ícone quando instalado no celular.",
      "Lançar gasto pelo Telegram numa cópia exige um bot do Telegram próprio dela — o bot que você já usa continua servindo só a sua cópia, não as novas.",
      "Cotação de ações e leitura de comprovante por foto no Telegram continuam opcionais por cópia: sem configurar, o resto do app funciona normalmente, só esses dois recursos específicos ficam de fora.",
    ],
  },
  {
    version: "1.32.0",
    date: "2026-10-03",
    title: "Panorama: renomear também os lançamentos avulsos",
    items: [
      "A v1.31.0 deixou de fora justamente as linhas que mais precisavam: contas lançadas como compra parcelada (IPVA, seguro, qualquer coisa em N vezes) não têm cadastro, então o nome delas não virava botão. Eram 28 linhas na matriz. Agora viram.",
      "Renomear uma dessas reescreve o nome em todos os meses de uma vez, inclusive nos já pagos — senão a linha se partiria em duas na matriz, metade com o nome velho. O parcelamento em si não é tocado: as parcelas continuam amarradas entre si.",
      "\"Excluir conta\" também funciona nelas: apaga o que está em aberto em todos os meses de uma vez. Os meses pagos ficam, como nas contas cadastradas.",
      "Depósito e retirada de caixinha continuam sem o botão, de propósito: o extrato da caixinha e o planejamento reconhecem esses lançamentos pelo nome, então renomear ali apagaria o movimento do extrato. Para mudar esse nome, renomeie a caixinha em Reservas.",
    ],
  },
  {
    version: "1.31.0",
    date: "2026-10-03",
    title: "Panorama: criar, renomear e excluir contas sem sair da tela",
    items: [
      "Botão \"Nova conta\" no topo do Panorama: nome, categoria, valor por mês, quando começa e por quantos meses. A conta já nasce lançada em todos esses meses, então a linha aparece preenchida na matriz na hora.",
      "Clicando no NOME da conta (coluna da esquerda) dá para renomear e mudar de categoria ali mesmo — a linha pula para a seção nova. Antes isso só existia na tela de Itens.",
      "No mesmo lugar tem \"Excluir conta\": apaga o que está em aberto em TODOS os meses de uma vez, em vez de mês a mês. Os meses já pagos ficam, porque são história — a conta sai de circulação e para de ser provisionada.",
      "Conta que nunca foi paga some de vez da matriz; conta com histórico continua aparecendo só com o passado.",
      "Conta que é a provisão de uma assinatura do cartão (YouTube, iCloud e companhia) não deixa excluir por aqui: ela avisa em qual cartão a assinatura está, para você encerrar no lugar certo em vez de a linha sumir sozinha do mês.",
      "Linha de cartão, de reserva do dia a dia e lançamento avulso continuam como estavam: o nome não vira botão, porque elas não são uma conta cadastrada.",
    ],
  },
  {
    version: "1.30.1",
    date: "2026-09-18",
    title: "Panorama: cabeçalho dos meses fica parado",
    items: [
      "A linha dos meses agora fica congelada no topo, do mesmo jeito que a coluna das contas já ficava parada na esquerda. Rolando a lista, você continua sabendo se aquele valor é de set/26 ou de mar/27.",
      "A tabela passou a rolar dentro do próprio quadro, em vez de arrastar a página inteira — os botões de exportar ficam sempre à vista, no rodapé.",
    ],
  },
  {
    version: "1.30.0",
    date: "2026-09-13",
    title: "Fatura parcial do Bradesco pelo Telegram",
    items: [
      "O app do Bradesco deixa você baixar o extrato da fatura ANTES dela fechar. Agora dá para mandar esse PDF no Telegram: o bot diz o que já foi comprado e ainda não está lançado aqui — sem esperar o fechamento.",
      "Ele não fica reclamando de total que não bate, porque esse extrato vem incompleto de propósito: no de 13/09 vieram 26 compras, e o app já tinha 50 na mesma fatura. Então o bot só aponta o que FALTA, e avisa quantas linhas o extrato deixou de mostrar.",
      "Cada compra que falta vem com o tamanho do estrago: o bot soma todas as parcelas que ainda vão cair, não só a parcela do mês — o total pode ficar bem maior do que parece à primeira vista.",
      "O extrato não traz o limite. Escreva \"usado <valor>\" na legenda do PDF (o número que aparece na tela do banco) e o bot compara com a dívida que o app projeta — foi assim que apareceu uma diferença entre o que o banco considerava usado e o que o app projetava.",
      "Quando o valor da parcela difere por centavos, ele não trata como erro: o banco redistribui o arredondamento entre as parcelas, e o bot só conta quantas linhas estão nessa situação.",
      "A importação pela tela de Cartões recusa esse PDF de propósito, com o motivo escrito. Fatura em aberto ainda muda até fechar, e gravar valor provisório bagunçaria os meses seguintes.",
    ],
  },
  {
    version: "1.29.0",
    date: "2026-09-08",
    title: "Calculadora: à vista ou parcelado",
    items: [
      "Tela nova (menu → Calculadora). Você põe o preço cheio, o desconto que a loja dá à vista e em até quantas vezes ela parcela; ela responde qual das duas sai mais barato.",
      "A conta não é pelo total. Um valor parcelado pode custar menos que o mesmo valor à vista, porque as parcelas futuras ficam rendendo na reserva até vencerem. Cada parcela é trazida a valor de hoje pelo rendimento, e é esse valor que entra na comparação.",
      "Com 5% de desconto à vista, por exemplo, o parcelamento só passa a valer a pena a partir de 10x — e por uma diferença de poucos reais; em prazos menores o desconto à vista ainda compensa mais. A tabela mostra todos os prazos, então dá para ver onde vira.",
      "Ela também traduz o desconto em juros: 5% à vista equivale a pagar 0,94% ao mês em 10x. Como a reserva rende 1,00%, parcelar compensa — é a mesma conclusão pelo outro lado.",
      "Se o parcelamento tiver juros, preencha o \"Total parcelado\" com o valor cheio da soma das parcelas e a comparação continua valendo.",
    ],
  },
  {
    version: "1.28.0",
    date: "2026-09-08",
    title: "O gráfico Saldo mensal mostra o tamanho do mês",
    items: [
      "Antes o gráfico desenhava só uma barra por mês, o saldo. O problema é que o saldo some: um mês que recebe muito e gasta quase o mesmo fecha com uma diferença pequena e virava um tracinho perto do zero, como se nada tivesse acontecido.",
      "Agora cada mês é uma coluna espelhada — receitas para cima em verde, despesas para baixo em vermelho — e o saldo é a linha roxa passando entre as duas. Dá para ver de relance qual mês movimenta mais dinheiro e que os meses seguintes costumam se repetir.",
      "Os nomes dos meses no eixo ficaram curtos (\"set/26\" no lugar de \"set. de 2026\"), o que também deu ar ao gráfico de Patrimônio, que usa os mesmos meses.",
      "O detalhe da barra continua abrindo receitas, despesas, saldo e — no mês corrente — a divisão entre o que já aconteceu e o que falta acontecer.",
    ],
  },
  {
    version: "1.27.0",
    date: "2026-09-08",
    title: "O saldo do mês virou um quadro só",
    items: [
      "As duas metades do saldo não cabiam no card estreito — o rótulo saía cortado e a frase quebrava no meio no celular. Agora elas têm um quadro próprio, de largura inteira, com as quatro pontas que formam o número: recebido e pago de um lado, a receber e a pagar do outro.",
      "Em setembro, por exemplo, a parte que já aconteceu ficou no vermelho (pagou mais do que tinha recebido até ali) e a parte que falta acontecer fica no azul (entra mais do que sai). Somando as duas pontas é que se chega ao saldo do mês.",
      "Em cima ficaram três cards — Receitas, Despesas e Falta pagar —, mais largos e mais folgados que os quatro de antes.",
      "No gráfico Saldo mensal do Dashboard, a barra do mês corrente também misturava as duas coisas. O detalhe da barra agora mostra a divisão, então dá para ver por que ela está vermelha mesmo com dinheiro por entrar.",
    ],
  },
  {
    version: "1.26.0",
    date: "2026-09-08",
    title: "O card Saldo explica de onde vem o número",
    items: [
      "Dava para olhar a tela do Mês e não entender: \"tenho mais a receber do que a pagar no que ainda falta, por que o saldo está negativo?\". A resposta é que os dois cards falavam de períodos diferentes — o Saldo é o mês inteiro, e o \"sobram\" do Falta pagar é só o que ainda vai acontecer.",
      "Agora o card Saldo mostra as duas metades, que somadas dão o número dele: em setembro, por exemplo, a parte que já tinha acontecido estava no vermelho e a que faltava acontecer estava no azul — mas o que ainda entra não cobre o que já saiu, e o mês fecha no vermelho.",
      "A linha da caixinha continua embaixo, porque é ela que explica como a parte já paga foi coberta: parte do que saiu veio de lá.",
      "Vale no Mês e no Dashboard, que usam os mesmos cards.",
    ],
  },
  {
    version: "1.25.7",
    date: "2026-09-05",
    title: "Todas as 25 faturas conferidas",
    items: [
      "Passei fatura por fatura, de agosto/2026 a agosto/2027. Em todas, o valor que o app mostra bate com a soma dos lançamentos, e as parcelas foram casadas uma a uma com a do mês anterior. Nenhum problema.",
      "Parcelas com o apelido renomeado voltaram a ser reconhecidas como parcelamento: ao trocar o apelido, elas perdiam o \"(11/12)\" que ficava no nome, e o app deixava de saber que eram parcelas. Agora essa informação fica gravada em campo próprio, então o nome fica limpo e a parcela continua identificada.",
    ],
  },
  {
    version: "1.25.6",
    date: "2026-09-05",
    title: "Datas das parcelas que criei ontem estavam erradas",
    items: [
      "As quatro parcelas de uma compra parcelada que o app criou na versão anterior ficaram todas com a data da compra (04/09), quando o certo é a data em que cada parcela cai — o mês anterior ao da fatura. É assim que todas as outras séries do cartão funcionam, e é o que faz a linha ser reconhecida quando a fatura de verdade chega.",
      "Corrigido: a parcela que cai na fatura de novembro tem data 04/10, a de janeiro tem 04/12, e assim por diante.",
      "Sem efeito em valor nenhum: as faturas continuam iguais.",
    ],
  },
  {
    version: "1.25.5",
    date: "2026-09-05",
    title: "Uma compra parcelada estava pela metade",
    items: [
      "Das 8 parcelas, só 4 estavam lançadas — faltavam a 2ª, a 4ª, a 5ª e a 7ª, um valor que o planejamento não previa. Agora as oito estão lá, de outubro/2026 a maio/2027.",
      "As que existiam também estavam um mês adiantadas: com a primeira parcela em outubro, a terceira tem que cair em dezembro, e não em novembro. Isso era efeito da correção do ciclo de ontem, que moveu a primeira parcela sem levar a fila junto.",
      "O valor da sua fatura de novembro não muda — o que mudou foi só o número da parcela, que agora é a 2ª de 8.",
      "Conferi as demais compras parceladas: nenhuma tem parcela faltando no meio.",
    ],
  },
  {
    version: "1.25.4",
    date: "2026-09-05",
    title: "Na importação, quem manda é o arquivo do banco",
    items: [
      "Um CSV é sempre de UMA fatura, mas o app decidia lançamento por lançamento pela data — e o dia do fechamento fica partido entre duas faturas, porque o banco corta numa hora, não à meia-noite. Foi assim que 7 compras do dia 04/09 foram parar na fatura de setembro, que já estava fechada e paga.",
      "Agora todas as linhas do arquivo entram na fatura dele. A data continua servindo para o app descobrir de que fatura é o arquivo, e só para isso.",
      "O dia de fechamento do Nubank voltou para 4, como estava. Eu tinha mudado para 3 na versão anterior tentando resolver isso pela data — mas nenhum dia de fechamento resolve um corte que acontece no meio do dia, e a mudança quebraria o lançamento das parcelas.",
      "As duas faturas seguem corretas, cada uma com o valor que já tinha antes do ajuste.",
    ],
  },
  {
    version: "1.25.3",
    date: "2026-09-05",
    title: "A fatura do Nubank de outubro estava menor do que devia",
    items: [
      "O arquivo da fatura que vence em 12/10 traz compras de 04/09 e de 05/09. O app entendia que o dia 4 ainda pertencia à fatura de setembro (porque o Nubank fecha dia 4) e mandava para o mês errado 7 compras do dia 4 — entre elas, uma parcela de uma compra parcelada.",
      "No Nubank o dia do fechamento já conta na fatura NOVA. As 7 compras foram para outubro e as duas faturas passaram a bater com o arquivo: setembro ficou igual ao \"Pagamento recebido\" que o próprio CSV registra, e outubro fechou no valor certo.",
      "O campo de fechamento do cartão agora explica o que preencher: o último dia que ainda entra na fatura. Para bancos que contam o dia do fechamento na fatura nova, informe o dia anterior. O Nubank passou de 4 para 3, e o Bradesco não foi tocado.",
    ],
  },
  {
    version: "1.25.2",
    date: "2026-09-05",
    title: "Importação de fatura parou de comer compras repetidas",
    items: [
      "Ao importar o CSV de um ciclo que não é o principal do arquivo, o app perguntava \"já existe uma linha assim?\" e pulava se existisse. Isso evitava duplicar numa reimportação, mas comia compra legítima repetida: duas compras iguais no mesmo lugar e no mesmo dia viravam uma, e a diferença sumia sem aviso.",
      "Agora a comparação é por quantidade — se o arquivo traz duas compras iguais e o app tem uma, a segunda entra. Reimportar o mesmo arquivo continua não duplicando nada.",
      "A mensagem do bot passou a dizer quantos dos lançamentos do arquivo entraram e quantos já estavam lá, em vez de só contar os novos.",
    ],
  },
  {
    version: "1.25.1",
    date: "2026-09-04",
    title: "As compras estimadas saíram da previsão",
    items: [
      "A linha de compras estimadas que a v1.24.0 acrescentava aos meses futuros foi removida. Ela deixava todos os meses no vermelho porque contava duas vezes o mesmo gasto: a reserva do dia a dia já cobre mercado, restaurante e combustível, que também entravam na estimativa do cartão.",
      "O gráfico de saldo mensal voltou ao que mostrava antes: setembro e outubro no vermelho, os demais no azul.",
      "O teto por cartão continua, e agora serve só para o que você pediu — o card \"Fatura em formação\" no Dashboard, que compara a próxima fatura com o teto enquanto ainda dá para mudar o rumo.",
      "Fica valendo o que a conta mostrou: depois de tirar as contas fixas da receita, o que sobra para o cartão é bem menor do que a média real das faturas — por isso os meses futuros apareciam no vermelho.",
    ],
  },
  {
    version: "1.25.0",
    date: "2026-09-04",
    title: "Teto do cartão e a fatura que está se formando",
    items: [
      "Card novo no topo do Dashboard: \"Fatura em formação\", com a próxima fatura de cada cartão contra o teto que você definir. Ele mostra o percentual já usado do teto de cada cartão, e também avisa quando um cartão já passou do teto — mesmo com o mês mal começando.",
      "Antes você só descobria o tamanho da fatura quando ela fechava, e aí não dava mais para mudar nada. A barra fica verde, âmbar a partir de 80% e vermelha quando passa.",
      "O teto conta a fatura inteira, parcelas antigas incluídas: elas ocupam o mesmo espaço que as compras novas, e ignorá-las mostraria uma folga que não existe.",
      "O campo do cartão virou \"Teto mensal de gastos\" e serve para as duas coisas — acompanhar o ciclo em formação e completar a previsão dos meses futuros, que só têm as parcelas já lançadas.",
      "A fatura acompanhada é sempre a do mês seguinte: a do mês corrente já fechou, e para ela não há mais decisão a tomar.",
    ],
  },
  {
    version: "1.24.0",
    date: "2026-09-04",
    title: "O saldo dos meses futuros parou de mentir",
    items: [
      "A fatura de um mês distante só continha as parcelas que você já lançou, então ela derretia: a média das faturas reais é bem mais alta do que o pouco que ficava lançado para um mês tão distante. O saldo daqueles meses aparecia positivo por falta de despesa, não por sobra de dinheiro.",
      "Cada cartão ganhou um \"gasto mensal estimado\" (em Cartões → Editar). Com ele, os meses futuros recebem uma linha de compras estimadas que completa a diferença até o valor esperado — e ela some sozinha quando a fatura real chega e passa da estimativa. Nada é provisionado no mês corrente, cuja fatura já está formada.",
      "O card \"Falta pagar\" agora diz se o que ainda entra cobre o que falta. Em setembro, por exemplo, ele mostrava que o que ainda tinha a receber não cobria tudo o que ainda faltava pagar.",
      "Era isso que confundia: o card \"Saldo\" soma o mês inteiro, então ele conta também o que já entrou no começo do mês — e que já foi para as contas e para a caixinha. O número não estava errado, mas respondia outra pergunta.",
      "Panorama, tela do Mês e gráfico do Dashboard usam a mesma provisão, então os três contam a mesma história.",
    ],
  },
  {
    version: "1.23.0",
    date: "2026-09-04",
    title: "Panorama mostra só o que ainda tem a acontecer",
    items: [
      "Conta sem nada a pagar nem a receber deste mês em diante deixou de aparecer no Panorama. Saíram 6: quatro contas que já tinham acabado e viravam uma linha de traços, mais o Depósito e a Retirada de caixinha de setembro, que já aconteceram.",
      "Elas voltam com um clique em \"Mostrar quitados\" — o mesmo botão que já revelava os meses fechados. A legenda diz o que está escondido: \"Ocultando 2 meses quitados: jul/26, ago/26 · 6 contas quitadas\".",
      "Conta paga no mês mas com cobrança à frente continua aparecendo: é o futuro que o Panorama serve para mostrar. Uma assinatura anual, por exemplo, fica mesmo só com traços nos primeiros meses, porque a cobrança dela é uma vez por ano.",
      "O \"Ocultar pagos\" não mudou: ele continua sendo a visão do mês, escondendo quem já foi quitado até hoje.",
    ],
  },
  {
    version: "1.22.1",
    date: "2026-09-04",
    title: "As diaristas repetidas de 2027 a 2029 saíram",
    items: [
      "Nove meses de 2027 a 2029 tinham cada visita da diarista lançada duas vezes — o mês cobrava o dobro do que devia. Saíram 78 lançamentos duplicados, e cada um desses meses voltou a ter uma diarista por data, igual aos outros 33.",
      "Sua cadência de 2x por semana sempre esteve certa: o problema era que duas séries semanais conviviam no mesmo mês, a que vale e uma antiga que deveria ter parado em junho/2027. A causa foi corrigida na versão anterior; isto limpou o que já estava lançado.",
      "Nenhuma das linhas removidas estava paga e todas eram de meses futuros — nada de histórico foi tocado. O conteúdo delas foi salvo antes, em backups/, e dá para restaurar tudo com um comando se precisar.",
    ],
  },
  {
    version: "1.22.0",
    date: "2026-09-04",
    title: "Fechar o mês: o resto vai para a caixinha",
    items: [
      "Botão \"Fechar o mês\" na tela do Mês, que aparece quando todas as contas já foram baixadas e ainda sobrou ou faltou dinheiro. Sobrou, ele guarda na caixinha; faltou, ele tira de lá. O mês passa a fechar em zero.",
      "O motivo de isso ser preciso: o app não tem saldo de conta corrente, então cada mês começa do zero e o resto de um mês fechado fica pendurado para sempre. Julho aparece com uma sobra pequena (foi o mês em que você começou a usar o app, com poucos lançamentos) e agosto com uma falta, meses depois de terem acabado.",
      "Para mês antigo existe a opção \"o dinheiro já saiu (ou entrou) na conta de verdade\": o movimento entra no extrato da caixinha, mas o saldo dela continua o mesmo — porque você já fez a transferência no banco lá atrás. As duas linhas aparecem no extrato e explicam a história, em vez de o saldo mudar do nada.",
      "O valor usado é o que de fato entrou e saiu da conta, contando depósitos e retiradas de caixinha. Um mês pode ter sobrado no papel e ainda assim ter deixado a conta negativa, se a sobra já foi guardada.",
    ],
  },
  {
    version: "1.21.0",
    date: "2026-09-04",
    title: "Dashboard: o que vence, quanto rende e quanto custa cada categoria",
    items: [
      "Card \"Vence em breve\" no topo: as contas em aberto dos próximos 7 dias e as atrasadas em primeiro lugar, com o total e um atalho para pagar no Mês. Faltava a resposta para \"o que eu preciso pagar agora\" — ela só existia misturada à lista do mês.",
      "O gráfico do patrimônio desenhava quase uma reta: o eixo começava no zero, então uma alta real de 10% no período ficava espremida perto da base. Agora o eixo enquadra a faixa real de valores e a curva mostra o formato do crescimento. O título passou a escrever o percentual de variação.",
      "A pizza de despesas mostrava só as cores: para saber quanto era cada fatia, era preciso passar o mouse — e no celular não existe mouse. Agora cada categoria vem com valor e percentual ao lado (Cartão/Compras · 55,2%, Educação · 14,2%…).",
      "Cards sem conteúdo pararam de esticar. \"Renovações\", sem nenhuma renovação à vista, ocupava 190 pixels para uma frase só porque acompanhava a altura do card ao lado.",
    ],
  },
  {
    version: "1.20.0",
    date: "2026-09-04",
    title: "A tela do Mês ficou compacta e alinhada",
    items: [
      "No celular, cada lançamento ocupava quatro linhas e 270 pixels, com \"Previsto\" e \"Pago\" repetidos em toda linha. Agora são duas linhas e 77 pixels: nome e valor em cima; dia, baixa e ações embaixo. A tela do mês inteiro caiu de 8.340 para 4.323 pixels — cabem 9 lançamentos onde cabiam 3.",
      "O cabeçalho Item / Dia / Previsto / Situação / Ações aparece uma vez só, no topo da lista, e fica fixo enquanto você rola. Antes ele se repetia dentro de cada categoria.",
      "As categorias viraram faixas dentro de uma lista única, no lugar de um cartão por categoria. As colunas agora se alinham de ponta a ponta, de Recebimentos até Lazer.",
      "\"Ocultar pagas\" agora esconde também a categoria inteira quando não sobrou nada nela. Em setembro, 12 grupos viram 8: saem quatro categorias que estavam quitadas e só ocupavam espaço com o cabeçalho.",
      "No celular, Transferir, Guardar a sobra e as duas cópias ficam atrás de \"Mais ações\" — eram quatro botões empilhados antes de qualquer número aparecer. No computador continuam todos à vista.",
      "A barra de baixo do celular tinha oito ícones e cortava \"Categorias\" na borda. Agora são cinco (Dashboard, Mês, Panorama, Cartões, Reservas) e um \"Mais\" com o resto.",
      "Nos cards de resumo, o celular mostra a versão curta (só o valor que falta); no computador continua o texto completo com o quanto já foi pago.",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-09-04",
    title: "Extrato da caixinha: dá para conferir com o banco",
    items: [
      "Cada caixinha ganhou um extrato (o ícone de lista no card, em Reservas): depósitos, retiradas e ajustes numa lista só, do mais recente para o mais antigo, com o saldo depois de cada linha. É a tela para abrir lado a lado com o app do banco.",
      "As retiradas agora dizem o que pagaram — \"Pagamento de cartão de crédito\", por exemplo — no lugar de \"Retirada\" seguido do nome da própria caixinha, que não acrescentava nada.",
      "No topo do extrato, a checagem: o app soma os movimentos e compara com o saldo guardado. Suas três caixinhas fecham certinho.",
      "Mudar o valor da caixinha na mão deixou de ser invisível. Agora vira uma linha no extrato, com data e motivo — você escreve \"rendimento\" e no mês seguinte sabe de onde veio a diferença. Antes o número simplesmente mudava, e depois não havia como saber se foi rendimento, correção ou um depósito esquecido.",
      "Seu saldo antigo virou a primeira linha de cada extrato, \"Saldo de abertura\" em 19/07/2026, com o saldo que já existia em cada caixinha antes de o app registrar movimento. Agora o extrato fecha do primeiro dia até hoje.",
      "E tem a conferência: você digita o saldo que a aplicação mostra hoje e o app lança a diferença como ajuste, com a data. De uma conferência para a outra, dá para ver quanto rendeu.",
    ],
  },
  {
    version: "1.18.0",
    date: "2026-09-04",
    title: "Copiar o mês do ano passado parou de dobrar a diarista",
    items: [
      "Sua diarista vem 2x por semana, e isso sempre esteve certo no app. O que não estava: em 9 meses de 2027 a 2029 ela aparecia 4x por semana, porque duas séries semanais conviviam no mesmo mês — a que vale, de julho/2027 em diante, e a antiga, que deveria ter parado em junho/2027.",
      "A culpa era do \"Copiar mês do ano passado\": ele conferia se AQUELA série já estava no mês de destino, e não se a conta já estava lá. Como a série velha não estava, ele copiava por cima da nova. Agora a conferência é pela conta (nome e categoria), então nenhuma cópia dobra uma conta semanal que já existe.",
      "As 78 linhas a mais que já estão lançadas continuam onde estão — isso é uma limpeza à parte, quando você quiser.",
      "No mês que fecha no vermelho depois de você tirar dinheiro da reserva, o card Saldo agora diz quanto veio da caixinha, em vez de só \"tirado da caixinha\": é o que explica o buraco. Agosto é o caso — a diferença entre o que entrou e o que saiu veio de lá.",
    ],
  },
  {
    version: "1.17.0",
    date: "2026-09-04",
    title: "Desmarcar uma conta paga pela caixinha devolve o dinheiro",
    items: [
      "Até agora, desmarcar a baixa de uma conta paga pela caixinha deixava o dinheiro no limbo: a conta voltava a dever e a caixinha seguia mais pobre, sem aviso nenhum. Agora o app pergunta — \"esta conta foi paga pela caixinha X, devolver R$ Y para ela?\" — e, confirmando, devolve o valor, apaga a retirada e deixa a conta em aberto, tudo de uma vez.",
      "Ele devolve o valor da RETIRADA, não o da conta: quem editou a baixa depois de pagar não tira da caixinha um dinheiro que nunca saiu de lá.",
      "Seus movimentos antigos foram ligados às contas que pagaram: das 21 retiradas, 11 tinham correspondência exata (mesma competência, data e valor) e agora podem ser desfeitas assim. As outras 10 não tinham candidato único — nelas o app não arrisca e desmarcar segue como antes.",
      "Pagar duas contas pela mesma caixinha ao mesmo tempo não estoura mais o saldo. A conferência e o débito viraram uma operação só; antes cabia um segundo pagamento entre as duas, e a soma passava do que havia guardado.",
      "Cada lançamento passou a registrar quando foi criado — base para responder \"o que eu lancei hoje\" e para desfazer importações em lote mais adiante.",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-09-04",
    title: "Guardar a sobra sem sair da tela do Mês",
    items: [
      "Botão \"Guardar a sobra\" na tela do Mês: escolhe a caixinha, confirma o valor e pronto. Antes era pagar as contas no Mês, ir até Reservas e abrir o depósito lá — três telas para uma decisão só.",
      "A caixinha vem pré-selecionada: a do seu último depósito. Com três caixinhas cadastradas, era o campo que você sempre trocava na mão.",
      "O valor sugerido desconta o que já foi guardado no mês. Depois de mandar a sobra de setembro para a caixinha, o app não oferece guardar a mesma sobra outra vez — ele diz quanto você já guardou e avisa que guardar mais sai de outro mês.",
      "Correção de um recorte antigo: em qualquer janela do app, a última linha de texto antes do botão ficava escondida atrás dele. Aparecia, por exemplo, no aviso de sobra ao depositar na caixinha.",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-09-04",
    title: "Guardar dinheiro deixou de parecer gasto",
    items: [
      "Depósito na caixinha e retirada dela pararam de contar como despesa e receita do mês. Setembro é o exemplo: você recebeu o salário, pagou as contas e mandou o resto para a caixinha — e o app respondia que o mês tinha fechado bem mais no vermelho do que de fato ficou. O saldo agora mostra só o que realmente falta acontecer no mês.",
      "O card \"Meses no vermelho\" caiu bastante, porque o depósito na caixinha deixou de contar como se fosse rombo do mês. Ele existe para dizer quanto as caixinhas precisam cobrir; apontar o mês em que você ENCHEU a caixinha era o oposto do que ele serve para mostrar.",
      "O card Saldo passou a dizer embaixo quanto foi guardado no mês, para o dinheiro não sumir da tela só por não ser mais despesa.",
      "O depósito também saiu do ranking de despesas e da pizza por categoria — ele aparecia lá como se fosse o seu maior gasto do mês.",
      "O que NÃO mudou, de propósito: o fluxo de caixa por dia continua descontando o depósito (o dinheiro sai mesmo da conta corrente) e o patrimônio projetado segue igual, porque guardar não deixa ninguém mais rico — só troca o dinheiro de bolso.",
      "A sugestão de valor ao depositar continua descontando o que você já guardou: depois de mandar uma sobra para a caixinha, o app não oferece guardar a mesma sobra de novo.",
    ],
  },
  {
    version: "1.14.2",
    date: "2026-08-28",
    title: "Fatura do Bradesco não duplica mais a parcela já lançada",
    items: [
      "Compra feita depois do fechamento você lança na hora, pelo aviso do banco — que traz o nome curto da loja (\"AMAZON BR\") e a parcela dividida do total pelo número de vezes. Quando a fatura chegava com o nome completo do vendedor e o valor real da parcela, com poucos centavos de diferença pelo arredondamento do banco, o app não reconhecia que era a mesma compra: tratava como parcela atrasada, empurrava o parcelamento um mês e criava uma segunda sequência de parcelas ao lado da certa.",
      "Agora a parcela também casa por número de parcelas + parcela + valor com folga de centavos, quando o nome divergiu — a mesma folga que o app já usava para reconhecer o parcelamento. Havendo dois candidatos possíveis, ele não arrisca e deixa como antes.",
      "Sua fatura de setembro foi corrigida: saíram 86 linhas duplicadas espalhadas de outubro/2026 a julho/2027, e julho/2027 — que só existia por causa do erro — desapareceu. Setembro, a competência da fatura que fechou, não foi tocado.",
      "Na importação de fatura, o botão ao lado da data de pagamento passou a dizer o que faz: era \"Usar o vencimento (10/09)\", que parecia só registrar a data, e agora é \"Já paguei — usar o vencimento (10/09)\" — clicar nele dá baixa na fatura. O campo continua nascendo em branco, e em branco a fatura fica em aberto.",
    ],
  },
  {
    version: "1.14.1",
    date: "2026-08-28",
    title: "Proventos da B3 que sumiam da agenda",
    items: [
      "Provento de ação alugada agora entra. Quando alguém aluga seus papéis, a B3 não escreve \"Dividendo\" — escreve \"Reembolso\", porque quem alugou é que devolve o provento a você. O importador não conhecia esse nome e pulava a linha calado: era o caso de ALOS3 e BBSE3.",
      "A agenda parou de embaralhar provento de valor repetido. O casamento olhava só o valor (±2%) e ignorava a data — como RECV3 anuncia o mesmo valor para 31/12 de 2026, 2027 e 2028, cada linha \"corrigia\" a data da outra e a de 2026 desaparecia. Agora a data também conta, e cada anúncio casa com um provento só.",
      "Parcelas de valor parecido no mesmo dia pararam de se engolir: dois JSCP da CMIG4 com só 11 centavos de diferença entre si cabiam nos 2% e contavam como um.",
      "Sua agenda foi corrigida com a planilha de 27/08: entraram os proventos de ALOS3 de 02/09, de BBSE3 de 03/09 (no lugar da linha que estava somada à mão) e de RECV3 de 31/12/2026; saíram as duplicatas de CMIG4 e RECV3.",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-08-15",
    title: "Seguro anual parcelado se renova sozinho",
    items: [
      "A renovação parcelada de um item (seguro em 4x, por exemplo) agora provisiona TODAS as renovações até o último mês que você já tem lançado — quem planeja 2028 vê o seguro de 2028 hoje, sem depender do botão de copiar.",
      "O \"Copiar mês anterior\" parou de arrastar parcelas de renovação para o mês seguinte — as linhas dessas contas nascem da provisão, no mês certo de cada ano.",
      "Duas assinaturas de seguro foram convertidas para esse formato: os lançamentos de 2027 continuam onde estão e as parcelas de 2028 entram automaticamente.",
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
      "Estorno de compra pelo Telegram: \"estorno <valor> <loja>\". Estorno de IOF: \"estorno iof <valor>\". O valor abate a fatura em aberto na hora.",
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
      "A fatura de agosto agora bate exatamente com o valor fechado pelo banco: um estorno estava descontado duas vezes.",
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
