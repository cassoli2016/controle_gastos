# Fechamento mensal de faturas pelo Telegram

**Data:** 2026-08-05 · **Versão alvo:** 1.3.0 (minor)

## Problema

Todo mês, quando as faturas do Nubank e do Bradesco fecham, os valores no app
divergem do que o banco cobrou. A reconciliação de agosto/2026 do Nubank
(`scripts/fix-fatura-nubank-ago-2026.ts`) achou R$ 56,72 de diferença vinda de
dois erros distintos — um estorno lançado duas vezes e um centavo de parcela —
mais 5 compras que o banco empurrou para o ciclo seguinte. Nada disso é
detectável sem comparar com a fatura real.

Hoje isso só dá para fazer na mão (script pontual) ou pela web, e só no
Bradesco. O objetivo é: **mandar o PDF da fatura fechada no Telegram e ter o mês
travado no valor exato do banco**, com as parcelas dos meses futuros
reconstruídas.

## Escopo

**Dentro:** importar a fatura fechada em PDF pelo bot, validar contra o total do
próprio documento, gravar o mês e reconstruir os meses futuros pelo cronograma
de parcelas. Nubank e Bradesco.

**Fora:**

- Baixa de pagamento (marcar a fatura como paga) — decisão do usuário.
- Preview/confirmação no bot: aplica direto quando a fatura fecha, falha fechada
  quando não. Sem estado entre mensagens.
- CSV do Bradesco, outros bancos, parser da fatura *aberta* do Nubank (o CSV
  segue servindo para o meio do ciclo).

## Arquitetura

`applyBradescoFaturaImport` já é agnóstico de banco: recebe `lines`,
`faturaMonth`, `closingISO`, `limitCents` e não sabe a origem. Só o parser é
específico. As camadas ficam num DAG sem ciclo:

| Arquivo | Papel |
|---|---|
| `lib/fatura-core.ts` *(novo)* | Tipos (`FaturaLine`, `FaturaLineKind`, `FaturaBank`, `ParsedFatura`) **e** os helpers puros sobre linhas: `sumFaturaLines`, `buildInstallmentSchedule`, reescritores de marcador. Folha do grafo — não importa parser nenhum. |
| `lib/bradesco-fatura.ts` | Parser Bradesco. Passa a importar de `fatura-core`. |
| `lib/nubank-fatura.ts` *(novo)* | Parser Nubank. Importa de `fatura-core`. |
| `lib/fatura-parse.ts` *(novo)* | `detectFaturaBank` + `parseFatura`: fareja o banco e despacha. Importa os dois parsers e `fatura-core`. |
| `lib/fatura-import.ts` | Renome de `lib/bradesco-import.ts`. `applyBradescoFaturaImport` → `applyFaturaImport`. Corpo inalterado. |

`sumFaturaLines` e `buildInstallmentSchedule` ficam em `fatura-core.ts`, **não**
em `fatura-parse.ts`: os parsers precisam de `sumFaturaLines` para a própria
checagem de transcrição, e `fatura-parse` importa os parsers — colocá-los ali
fecharia um ciclo (`fatura-parse → nubank-fatura → fatura-parse`). Por isso
`fatura-core` carrega tipos e helpers juntos e é folha.

Consumidores:

- `app/api/telegram/route.ts` — handler novo para `.pdf`.
- `app/(app)/cartoes/actions.ts` — `previewBradescoFatura`/`applyBradescoFatura`
  → `previewFatura`/`applyFatura`, chamando `parseFatura`. A web ganha o Nubank
  sem código novo.
- `app/(app)/cartoes/ImportFaturaDialog.tsx` — acompanha o renome das actions.

### Duas mudanças fáceis de esquecer em `cartoes/actions.ts`

O payload da web é revalidado no servidor, e os dois pontos abaixo quebram o
Nubank **silenciosamente** se passarem batido (toda importação seria recusada):

1. `applyPayloadSchema` ganha `bank` e `expectedLinesCents` (o schema hoje tem
   `totalCents`, `lines`, etc.).
2. A revalidação `if (sumFaturaLines(lines) !== totalCents)` passa a comparar com
   **`expectedLinesCents`**, não com `totalCents`. Só coincidem no Bradesco.

## Tipo compartilhado

```ts
export type FaturaLineKind = "purchase" | "refund" | "payment";

export type FaturaLine = {
  dateISO: string;
  description: string;
  /** Negativo em refund/payment. */
  cents: number;
  kind: FaturaLineKind;
  installment: { seq: number; count: number } | null;
};

export type FaturaBank = "nubank" | "bradesco";

export type ParsedFatura = {
  bank: FaturaBank;
  /** Competência = mês do vencimento (YYYY-MM). */
  faturaMonth: string;
  dueDateISO: string;
  closingISO: string;
  /** "Total a pagar" (Nubank) / "Total da fatura" (Bradesco). */
  totalCents: number;
  /** Invariante: soma das linhas purchase+refund TEM que dar isto. */
  expectedLinesCents: number;
  limitCents: number | null;
  upcoming: { nextCents: number; totalCents: number } | null;
  lines: FaturaLine[];
  warnings: string[];
};
```

A diferença de validação entre os bancos colapsa num único campo. A camada
compartilhada tem uma regra só:

```
sumFaturaLines(lines) === expectedLinesCents   // senão, aborta
```

- **Bradesco:** `expectedLinesCents === totalCents` (comportamento atual, preservado).
- **Nubank:** a antecipação do meio do ciclo entra no "Pagamento recebido" do
  resumo, então o total esperado das linhas é maior que o total a pagar.

`bank` está no tipo (não só como metadado) porque `buildInstallmentSchedule`
reescreve o marcador da parcela ao projetar os meses futuros e os formatos
diferem — Bradesco `(09/12)`, Nubank `- Parcela 8/12`. Como as `lines` são
serializadas em JSON no payload da web, não dá para passar uma função de
reescrita; o `bank` seleciona o reescritor.

## Parser do Nubank

Layout documentado em `docs/fatura-nubank.md`. Fatura-modelo: fechada em
05/08/2026, vencimento 12/08/2026, 14 páginas, 229 lançamentos.

### Âncoras do documento

| Campo | Âncora |
|---|---|
| `dueDateISO` | `Data de vencimento: 12 AGO 2026` |
| `faturaMonth` | mês do vencimento |
| `closingISO` | `Fechamento da próxima fatura 05 SET 2026` menos 1 mês; fallback pelo fim de `Período vigente: 05 JUL a 05 AGO` |
| `totalCents` | `Total a pagar R$ 17.884,29` |
| `limitCents` | `Limite total do cartão de crédito: R$ 51.550,00` (página 1) |
| `upcoming` | `Saldo em aberto da próxima fatura` / `Saldo em aberto total` |

Meses vêm abreviados em português maiúsculo (`JAN FEV MAR ABR MAI JUN JUL AGO
SET OUT NOV DEZ`).

**Não usar** `LIMITES DISPONÍVEIS` da página 4: a coluna "Disponível" traz o
limite total, não o disponível de fato — a âncora da página 1 é a inequívoca.

### Bloco de resumo e o invariante

```
Fatura anterior                                    12.535,60
(−) Pagamento recebido                             12.990,85
(+) Total de compras de todos os cartões           18.446,11
(+) IOF de compras internacionais                       0,55
(+) Outros lançamentos                              −107,12
(=) Total a pagar                                  17.884,29
```

`expectedLinesCents` é derivável do resumo por **duas rotas independentes**, e o
parser calcula as duas e exige que concordem — se o resumo foi lido errado, elas
divergem e a importação aborta antes de tocar no banco:

```
rota A = compras + iof + outros                   = 18.339,54
rota B = total a pagar + pagamento − fatura anterior = 18.339,54
```

Confere com a reconciliação manual: o extrato real soma 18.339,54, o
`replaceCardMonth` preserva a antecipação de −455,25 já gravada, e o mês fecha em
17.884,29.

Checagens do parser, em ordem:

1. Identidade do resumo: `anterior − pagamento + compras + iof + outros === total`. Falha ⇒ **aborta**.
2. Rota A === rota B. Falha ⇒ **aborta**.
3. `sumFaturaLines(lines) === expectedLinesCents`. Falha ⇒ **aborta**, mostrando os dois valores.
4. `soma(|linhas payment|) === pagamento recebido`. Falha ⇒ **aviso** (a seção
   "Pagamentos e Financiamentos" mistura pagamento com parcelamento de saldo).

`Total de compras de todos os cartões` (18.446,11) **não** é igual à soma dos
subtotais por pessoa (18.318,60) — a diferença de 127,51 não se decompõe de forma
óbvia e a composição de "Outros lançamentos" não foi determinada. Os dois entram
só como termos da identidade; nenhuma asserção é feita sobre eles isoladamente.

### Linhas de lançamento

Formato: `dd MMM  •••• NNNN  Descrição  R$ valor`, com variações — NuPay e NuTag
não têm cartão mascarado.

- Regex ancorada em `^dd MMM` no início da linha. Isso é o que protege das
  linhas que também contêm `R$` mas não são lançamento: subtotais por pessoa
  (`Cristian Cassoli R$ 15.097,66`), a conversão de compra internacional
  (`USD 3.00` / `Conversão: USD 1 = R$ 5,25`) e o detalhe do parcelamento
  (`↳ Total a pagar: R$ 83,74 … 4 parcelas de R$ 20,94.`).
- **Negativos usam o sinal Unicode U+2212 (`−`), não o hífen ASCII.** Aceitar os
  dois. Isso vale para `Crédito de "X"`, `Desconto Antecipação X`,
  `IOF de volta de X` e as linhas de pagamento.
- `- Parcela pp/tt` no fim da descrição ⇒ `installment` (sem zero à esquerda).
- `Pagamento em dd MMM` ⇒ `kind: "payment"` (fora da soma e não gravado como
  linha). Cobre tanto o pagamento da fatura anterior quanto a antecipação — a
  antecipação vive no banco como `CardTransaction.prepayment`, preservada pelo
  `replaceCardMonth`.
- `Saldo restante da fatura anterior R$ 0,00` ⇒ ignorar.
- **Duas seções de compras** (titular e adicional). Ambas entram no mesmo
  consolidado; os subtotais servem só de conferência humana.

### Inferência de ano

Mesma regra do Bradesco: mês da linha > mês do fechamento ⇒ ano anterior. Menos
crítico aqui porque o Nubank estampa toda parcela na data de abertura do ciclo;
só compras à vista trazem data real.

## Fluxo no bot

```
documento .pdf
  → downloadTelegramFileBinary(file_id)        (já existe)
  → guard de 4 MB                              (mesmo limite da web)
  → unpdf extractText                          (import dinâmico, como na web)
  → parseFatura(text)   ──erro──▶ responde e NÃO grava
  → cartão pelo banco identificado (legenda ganha, se houver)
  → applyFaturaImport(...)
  → revalidateFinance()
  → responde: total, nº de lançamentos, meses atualizados, avisos
```

O dispatch de documentos em `POST` passa a ter três ramos: `.xlsx` → B3,
`.pdf` → fatura, resto → CSV. Hoje o `.pdf` cai no handler de CSV e é recusado.

O cartão sai do banco que o parser identificou (`findCardByHint("nubank")`),
então **não é preciso renomear o arquivo** — `Nubank_20260812.pdf` basta. A
legenda, quando existir, continua ganhando.

### Resposta de sucesso

```
✅ Fatura Nubank — ago/2026
Total: R$ 17.884,29 (confere com o PDF)
229 lançamentos

Meses atualizados:
• ago/2026 — R$ 17.884,29
• set/2026 — R$ 7.657,90
• out/2026 — R$ 5.197,94

⚠️ Próxima fatura projetada difere R$ 0,34 do PDF
```

## Tratamento de erro

Nada é gravado se a aritmética da própria fatura não fechar.

| Situação | Comportamento |
|---|---|
| PDF ilegível/protegido | "Não consegui ler o PDF (arquivo corrompido ou protegido)." |
| Banco não reconhecido | Diz quais faturas o bot entende |
| Qualquer checagem 1–3 do parser falha | Aborta mostrando os valores divergentes |
| Cartão não encontrado / ambíguo | Lista os cartões cadastrados |
| Total do mês aplicado ≠ `totalCents` do PDF | **Aviso, não aborta** — a importação está correta; a lacuna típica é antecipação não registrada, e a mensagem diz isso |
| Cronograma ≠ "próximas faturas" do PDF | Aviso com a diferença (`scheduleWarnings`, já existe) |

A distinção importa: as checagens do parser são sobre a **transcrição** (erro
nosso, aborta); a divergência do total aplicado é sobre o **estado do app** (a
fatura foi lida certa, falta um dado), então avisa e segue.

## Guard do CSV

Independente do fluxo mensal, mas é perda de dados viva: `handleCsvDocument`
roteia cada linha pela data (`cardTargetMonth`) e chama `replaceCardMonth` por
mês. O corte da fatura do Nubank é **intradiário** (emitida 05/08 às 03:31), então
o CSV da fatura aberta traz 5 linhas datadas 04/08 que, com `closingDay = 4`,
são roteadas para agosto — e o replace apaga as 229 linhas da fatura fechada,
deixando 5.

Regra nova, uma só: **um CSV é sempre de uma fatura.** O handler elege o mês
majoritário (mais linhas) e só nele faz `replaceCardMonth`. Linhas que caem em
outro mês são **inseridas sem apagar nada**, pulando duplicatas por
`descrição + purchaseDate + amount`. Reproduz exatamente o correto no caso do
Nubank e não depende de heurística de "mês fechado".

Empate no mês majoritário: vence o mês mais recente (a fatura aberta é a que o
usuário está exportando).

## Testes

- `tests/nubank-fatura.test.ts` sobre `tests/fixtures/nubank-fatura.txt` —
  extração real anonimizada (nomes → `TITULAR`/`ADICIONAL`, dígitos de cartão →
  `0000`). Trava: `dueDateISO`, `faturaMonth`, `closingISO`,
  `totalCents === 1788429`, `expectedLinesCents === 1833954`, `limitCents`,
  `upcoming`, nº de linhas e a distribuição por `kind`.
- Casos de borda do parser, cada um com sua asserção: sinal U+2212; linha NuPay
  sem cartão mascarado; a linha de conversão internacional e o detalhe
  `↳ Total a pagar:` **não** virando lançamento; subtotal por pessoa idem;
  `Saldo restante da fatura anterior` ignorado.
- Cronograma: projeção de setembro derivada da fatura ≈ "Saldo em aberto da
  próxima fatura" do PDF, dentro da tolerância existente.
- `tests/fatura-parse.test.ts` — dispatcher: texto Nubank → parser Nubank;
  fixture Bradesco → parser Bradesco; lixo → erro.
- Guard do CSV: CSV dividido entre meses substitui só o majoritário e
  **preserva** o extrato do outro; reimportar não duplica as linhas inseridas.
- `tests/bradesco-fatura.test.ts` tem que continuar passando sem alteração de
  asserção — é a rede de segurança do move de tipos e dos renomes.
- Regressão do payload da web: `expectedLinesCents` divergente das linhas é
  recusado no servidor, e uma fatura Nubank válida **passa** (trava os dois
  pontos da seção "Duas mudanças fáceis de esquecer").

## Entrega

- `version` → **1.3.0** e entrada em `lib/changelog.ts` no mesmo commit
  (`AGENTS.md`; travado por `tests/changelog.test.ts`).
- `docs/fatura-nubank.md`: acrescentar as âncoras do parser, o invariante de duas
  rotas e o sinal U+2212. Atualizar o texto de `HELP` do bot, que hoje diz "PDF
  do Bradesco importa pelo app".
- `docs/index.md` e `docs/log.md` já referenciam `fatura-nubank`; sem mudança.

## Riscos assumidos

- **Layout do PDF muda:** os parsers são regex sobre layout estável. Se o banco
  mudar o documento, a importação falha fechada (não corrompe) e o erro aponta a
  âncora que faltou.
- **Corte intradiário:** continua sem solução exata. Uma compra lançada pelo bot
  ou por *share* no dia do fechamento pode cair na fatura errada; a importação da
  fatura fechada corrige quando ela chega.
- **`Outros lançamentos` não decomposto:** entra só como termo da identidade. Se
  o Nubank passar a usar essa linha para algo que não seja estorno/desconto, a
  checagem 3 pega a divergência e aborta.
