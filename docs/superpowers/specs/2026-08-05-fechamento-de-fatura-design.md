# Fechamento de fatura: a fatura como estado dos planos

**Data:** 2026-08-05 · **Versão alvo:** 1.4.0 (minor) · **Empilha sobre:** PR #29 (`feat/fatura-pdf-telegram`)

## Problema

O PR #29 deixou uma dívida: importar a fatura fechada **dobra** out/2026 → mai/2027
(outubro iria de R$ 5.197,94 para R$ 10.361,37). A reconstrução dos meses futuros
*recria* o cronograma por cima do que já existe, e as linhas antigas não são
reconhecidas — foram gravadas com `purchaseDate` na abertura do ciclo futuro e sob
duas convenções de parcela cujas descrições não casam.

Havia também um problema mais antigo, nunca tratado: o que o app lançou no mês e o
banco **não** cobrou (o bot registra a compra na hora, o banco pode jogar para o
ciclo seguinte) simplesmente desaparecia no replace.

## A virada

Em vez de a fatura ser "o total do mês", ela passa a ser **o estado de cada plano
de parcelamento**. Ela diz qual parcela foi cobrada; disso decorre tudo:

- O mês da fatura é substituído pelas linhas dela (como hoje).
- O que estava no mês e não veio na fatura **caminha para frente** em vez de sumir.
- Para cada plano, a cauda dos meses seguintes é acertada para exatamente
  `maiorParcelaCobrada+1 .. total`. Isso cobre de graça a quitação antecipada (a
  fatura mostra 10/10 ⇒ cauda vazia) e a parcela atrasada (mostra 2/6 quando o app
  esperava 3/6 ⇒ a cauda desloca).

Não é mais "recriar o cronograma": é reconciliar contra o que a fatura afirma.

### O que tornou isso possível

Medição sobre a fatura real (228 linhas no app, 228 na fatura): casando por
descrição normalizada + valor, sobram 31 órfãs e 31 só-na-fatura — e **são os mesmos
itens**. 26 diferem apenas pelo prefixo `Antecipada - `; 5 são o NuTag com apelido
diferente (`NuTag*BEI2A53` no app, `Transação de NuTag` na fatura).

Com o prefixo normalizado e um apelido para o NuTag, o casamento passa de 86% para
**~100%**, e o número real de órfãs em agosto é **zero**. Antes dessa medição eu
achava que casar descrições era inviável; é o que sustenta todo o desenho.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Parcela lançada que não veio na fatura | **O plano inteiro desloca um mês.** Se o banco não cobrou 3/6 em agosto, cobra em setembro, 4 em outubro, e o plano termina um mês depois. |
| Baixa de pagamento | **O diálogo pergunta a data**, já sugerindo o vencimento. Marca paga com valor e data; dá para deixar em aberto. |
| Reconstrução dos meses futuros | Deixa de recriar. Acerta a cauda por plano — completa o que falta, remove o que a fatura diz que não existe mais. |
| Onde grava | Tela **Cartões**. O bot segue só conferindo (PR #29). |

## Casamento de linhas

```
normalizeFaturaDescription(d):
  strip prefixo "Antecipada - "
  aplicar apelidos conhecidos (NuTag*XXXX → "Transação de NuTag")
  normalizeDescription (lib/description-match.ts: sem acento, minúsculas)
```

Chave de casamento: `(descrição normalizada, centavos)`, consumindo cada par uma
vez — duas linhas iguais no mesmo mês casam com duas da fatura.

**Órfã** = linha do app no mês da fatura sem par na fatura. Duas naturezas:

- **à vista** → move para o mês seguinte (o ciclo que ainda não fechou).
- **parcela** → o plano desloca: a parcela órfã vai para o mês seguinte e cada
  parcela posterior desce um mês, criando a nova última.

O apelido do NuTag entra numa tabela em `lib/fatura-aliases.ts`, para o próximo
apelido não virar código novo.

## Estado dos planos

Da fatura, para cada plano (chave: loja + total de parcelas + valor da parcela,
já implementada em `lib/fatura-core.ts`):

```
maiorParcelaCobrada = max(seq das linhas daquele plano na fatura)
cauda esperada = maiorParcelaCobrada+1 .. total, um por mês a partir do mês+1
```

A reconciliação por mês futuro:

1. Encontrar as linhas do app que pertencem a planos que a fatura conhece.
2. Ajustar para a cauda esperada: remover o que sobra, inserir o que falta,
   corrigir valor divergente.
3. **Não tocar em nada mais.** Compra à vista e planos que a fatura não conhece
   (compra feita depois do fechamento) sobrevivem intactos — é o que faltava na
   regra por data e o que causava perda de R$ 941,04 em setembro.

## Baixa de pagamento

O diálogo de importação ganha um campo de data, pré-preenchido com o vencimento da
fatura, e um jeito de deixar em aberto. Ao confirmar com data: `paid = true`,
`paidAmount = totalCents` da fatura, `paidDate` = a data escolhida.

`paidAmount` vem do **total da fatura**, não do consolidado calculado — é o que o
banco vai debitar. Se os dois divergirem, o preview já avisa (PR #29).

## Preview

A tabela de impacto por mês do PR #29 continua, e ganha o detalhe do que causa cada
mudança: quantas linhas movem, quantos planos deslocam, quantas parcelas entram ou
saem. É o que torna a confirmação informada — sem isso a operação mexe em até dez
meses às cegas.

## Testes

Tudo em cima de `tests/fixtures/nubank-fatura.txt` e da fixture do Bradesco.

- Casamento: prefixo `Antecipada - `, apelido do NuTag, duas linhas idênticas
  consumindo dois pares, e o caso real — **agosto tem zero órfãs**.
- Órfã à vista move para o mês seguinte.
- Plano desloca: 6x com a parcela 3 ausente vira 3 em set, 4 em out, e nova 6 em dez.
- Quitação antecipada: fatura com 10/10 ⇒ cauda vazia (é o mesmo mecanismo do
  deslocamento, não um caso especial).
- Preservação: compra à vista em mês futuro e plano iniciado depois do fechamento
  sobrevivem — trava a regressão dos R$ 941,04.
- Reconciliação com os números reais: importar a fatura de agosto sobre o estado
  atual deixa ago em R$ 17.884,29 e **não** dobra out→mai.
- Baixa: com data marca paga com o total da fatura; sem data deixa em aberto.

## Migração

A dívida de out/2026 → mai/2027 se resolve sozinha na primeira importação sob o
modelo novo: aquelas linhas pertencem a planos que a fatura conhece, então entram
no passo 2 da reconciliação e são acertadas para a cauda esperada. **Não precisa de
script de limpeza** — era o que eu ia propor antes, e o modelo novo dispensa.

Validar com a simulação antes de gravar: out/2026 tem que continuar em
R$ 5.197,94 (± centavos), não ir para R$ 10.361,37.

## Riscos assumidos

- **Apelido novo de estabelecimento** vira órfã falsa e move uma compra sem
  precisar. Mitigação: o preview mostra o que move, e a tabela de apelidos é o
  lugar de corrigir. Impacto medido hoje: 5 linhas em 228.
- **Deslocamento em cascata** mexe em vários meses de uma vez. Mitigação: preview
  com o detalhe por mês; nada grava sem confirmação.
- **Compra à vista lançada duas vezes** (bot + fatura com descrição diferente)
  aparece como órfã e é movida em vez de deduplicada. O preview expõe; o
  casamento por valor limita.
