# Importador de Fatura Bradesco no App — Design (Fase 2 do ciclo de melhorias)

**Data:** 2026-07-30
**Contexto:** A importação da fatura fechada do Bradesco hoje é manual (transcrição + scripts
`fix-fatura-ago-bradesco.ts` / `fix-faturas-futuras-bradesco.ts`). O PDF tem camada de texto
extraível (validado com `unpdf` na fatura real) e o layout está documentado em
`docs/fatura-bradesco-pdf.md`. Design aprovado pelo usuário.

## Fluxo

Tela **Cartões** → botão "Importar fatura" no card do cartão → dialog:

1. **Upload do PDF** → server action extrai o texto (`unpdf`) e parseia → **preview** (nada
   é gravado): competência-alvo, total, validações, linhas com **descrição editável**
   (apelidos manuais), linha de pagamento exibida desabilitada (não importa), avisos.
2. **Confirmar** → aplica: `replaceCardMonth` no mês-alvo + reconstrução dos meses
   seguintes a partir do cronograma de parcelas, preservando compras pós-fechamento e
   antecipações (mesma semântica dos scripts da fase da fatura). Toast com resumo por mês.

## Módulos

### `lib/bradesco-fatura.ts` (puro, sem prisma — todo testável)

- `parseBradescoFatura(text: string): BradescoFatura | { error: string }`
  - Âncoras (regex sobre o texto extraído): `Vencimento dd/mm/aaaa`, `Total da fatura R$ X`,
    `previsão de fechamento ... dd/mm/aaaa` (fechamento corrente = esse − 1 mês),
    Resumo (`Saldo anterior`, `Créditos/Pagamentos`, `Compras/Débitos`, `(=) Total`),
    `Próxima fatura R$`, `Demais faturas R$`, `Total para as próximas faturas R$`.
  - Linhas: `dd/mm DESCRIÇÃO... valor[ -]` (negativo = sufixo `-`, COM espaço antes no texto
    extraído); marcador de parcela `(pp/tt)`; `kind`: `payment` (contém "pagamento
    recebido", sem caixa/acentos), `refund` (negativo), `purchase`.
  - Ano inferido: mês da linha > mês do fechamento corrente → ano anterior.
  - `faturaMonth` = mês do vencimento (`dueDateISO.slice(0, 7)`).
- `sumFaturaLines(lines)` — soma líquida SEM as linhas `payment`.
- `buildInstallmentSchedule(lines, faturaMonth)` — parcelas pp+1..tt de cada `purchase` com
  marcador, mês a mês, descrição com marcador incrementado (lógica promovida do script
  `fix-faturas-futuras-bradesco.ts`). `refund`/`payment` não geram parcelas (estorno de
  parcelado cancela o plano — limitação documentada: não abate plano de compra positiva
  correspondente).
- Validações: soma ≠ `(=) Total` do Resumo → **erro** (aborta preview); cronograma vs
  "Total parcelado para as próximas faturas" divergindo mais que R$ 5,00 → **aviso** no
  preview (arredondamento de centavos do Bradesco).

### `lib/bradesco-import.ts` (prisma)

- `applyBradescoFaturaImport({ card, faturaMonth, closingISO, lines }): Promise<{ months: { month: string; totalCents: number }[] }>`
  1. Mês-alvo: `replaceCardMonth` com as linhas não-`payment` (descrições já editadas).
  2. Meses seguintes: união dos meses do cronograma com meses > faturaMonth que tenham
     extrato do cartão; em cada um, apaga linhas supersedidas (`prepayment=false` e
     `purchaseDate` nula ou ≤ fechamento), insere as parcelas do cronograma e regrava o
     consolidado com a soma líquida (`upsertCardEntry` mode "set" — consolidado zerado sai).

### Server actions (`app/(app)/cartoes/actions.ts`, blindadas com `guardAction`)

- `previewBradescoFatura`: FormData com `cardId` + `file` (PDF ≤ 4MB, tipo application/pdf)
  → unpdf → parse → `{ preview }` serializável ou `{ error }` amigável (ex.: PDF sem texto,
  formato não reconhecido).
- `applyBradescoFatura`: FormData com payload JSON (cardId, faturaMonth, closingISO,
  totalCents, lines) validado com zod; re-valida a soma contra totalCents no servidor;
  chama `applyBradescoFaturaImport`; `revalidateFinance()`; retorna resumo.

### UI (`app/(app)/cartoes/ImportFaturaDialog.tsx`, client)

Dialog por cartão (botão "Importar fatura" ao lado de "Antecipar"): passo 1 file input +
"Ler fatura"; passo 2 preview com metadados, avisos, tabela de linhas com Input de descrição
(estado local), pagamento desabilitado; "Importar" envia JSON em input hidden. Toast padrão
(`useActionToast`).

### Config

- `next.config.ts`: `experimental.serverActions.bodySizeLimit: "4mb"` (doc do Next instalado
  confirma a chave; default 1MB é apertado para PDFs de fatura maiores).
- Dependência nova: `unpdf`.

## Testes

- Fixture `tests/fixtures/bradesco-fatura.txt`: texto real da fatura ANONIMIZADO (nome/CPF/
  endereço trocados; valores e linhas reais mantidos) — o PDF nunca entra no repo.
- Parser: metadados, 46 linhas, tipos (payment/refund/purchase), ano inferido (nov/dez →
  ano anterior), negativo com espaço (`1.031,53 -`), soma = total.
- Schedule: setembro = R$ 1.432,33 (diff R$ 0,35 do PDF → aviso), total futuro R$ 9.063,70.
- Texto sem âncoras (PDF errado) → `{ error }`.
- Ações: shape do payload (zod) — teste de recusa de soma divergente.

## Fora de escopo

- OCR de fatura escaneada (PDF sem camada de texto → erro amigável).
- PDF do Nubank (CSV já existe), outros bancos.
- Matching automático de apelidos (edição manual no preview cobre).
- Persistir apelidos para reuso em faturas futuras.
