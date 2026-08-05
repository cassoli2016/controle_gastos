// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber, formatCents } from "@/lib/money";
import { upsertCardEntry } from "@/lib/card-entry";

/**
 * Reconcilia o cartão Nubank com os documentos reais do banco (2026-08-05):
 * a fatura FECHADA de agosto (PDF, vencimento 12/08) e os lançamentos da
 * fatura ABERTA de setembro (CSV, vencimento 12/09). Ver `docs/fatura-nubank.md`.
 *
 * O extrato de agosto já estava quase todo certo (veio de shares/CSV ao longo
 * do ciclo) — divergia em R$ 56,72 do "Total a pagar" do PDF, por dois erros
 * que se somam:
 *
 *   1. O estorno da Shopee de 02/08 foi lançado DUAS vezes: como linha de
 *      crédito (`Crédito de "Shopee *Conceptartdeco"` −56,71) e de novo como
 *      antecipação de fatura (−56,71, prepayment). A seção "Pagamentos e
 *      Financiamentos" do PDF lista só dois pagamentos (12.535,60 em 06/07 e
 *      455,25 em 15/07) — a antecipação de 56,71 não existe.
 *   2. `Privalia Br I - NuPay - 4/4` estava R$ 20,93; o PDF detalha a parcela
 *      em R$ 20,94 ("R$ 83,74 … divididos em 4 parcelas de R$ 20,94").
 *
 * Em setembro faltavam as 5 compras de 04/08 que o banco empurrou para o ciclo
 * NOVO: o corte foi intradiário (fatura emitida 05/08 às 03:31), então parte
 * do dia 04 ficou em agosto e parte em setembro. Nenhum `closingDay` resolve
 * isso — as 5 linhas são fixadas em setembro porque é o que o banco diz.
 *
 * Confere os totais projetados ANTES de escrever: se o extrato do banco não
 * chegar exatamente no valor dos documentos, aborta sem tocar em nada.
 * Idempotente: cada correção verifica o estado antes de escrever.
 *
 * Uso: npx tsx scripts/fix-fatura-nubank-ago-2026.ts          (simulação)
 *      npx tsx scripts/fix-fatura-nubank-ago-2026.ts --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");

const AUGUST = "2026-08";
const SEPTEMBER = "2026-09";

/** PDF, "Resumo da fatura atual" → Total a pagar. */
const EXPECTED_AUGUST_CENTS = 1788429;
/**
 * Soma do CSV da fatura aberta. O PDF projeta R$ 7.657,56 em "Saldo em aberto
 * da próxima fatura"; os 34 centavos de diferença são deriva do próprio banco
 * entre o snapshot do PDF (05/08 03:31) e a exportação do CSV. O CSV é a fonte
 * mais recente, então é ele que manda.
 */
const EXPECTED_SEPTEMBER_CENTS = 765790;

/** Vencimento real, confirmado em dois ciclos: 12/08 e 12/09. */
const DUE_DAY = 12;

/** Estorno duplicado em agosto (lançado também como antecipação). */
const DUPLICATE_PREPAYMENT = { dateISO: "2026-08-02", cents: -5671 };

/** Parcela financiada com centavo errado em agosto. */
const CENT_FIX = { description: "Privalia Br I - NuPay - 4/4", fromCents: 2093, toCents: 2094 };

/**
 * Compras de 04/08 que caíram na fatura de SETEMBRO (só no CSV, não no PDF).
 * [dataISO, descrição verbatim do CSV, centavos].
 */
const SEPTEMBER_MISSING: [string, string, number][] = [
  ["2026-08-04", "Mercadolivre*Dedstore", 1900],
  ["2026-08-04", "Es Estacionamento", 23000],
  ["2026-08-04", "Abastec*Abastece Ai", 28380],
  ["2026-08-04", "Festval Torres", 23908],
  ["2026-08-04", "IOF de volta de Paddle.Net* Dr.Buho", -468],
];

async function extractCents(cardId: string, month: string): Promise<number> {
  const agg = await prisma.cardTransaction.aggregate({
    where: { cardId, month: monthToDate(month) },
    _sum: { amount: true },
  });
  return agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
}

async function main() {
  console.log(APPLY ? "MODO: gravando (--apply)\n" : "MODO: simulação — nada será gravado\n");

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: "nubank", mode: "insensitive" } },
  });
  if (!card) throw new Error("Cartão Nubank não encontrado no banco.");
  const cardRef = { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: DUE_DAY };

  // ---------- 1. Levantamento do que precisa mudar (sem escrever) ----------
  const prepays = await prisma.cardTransaction.findMany({
    where: {
      cardId: card.id,
      month: monthToDate(AUGUST),
      prepayment: true,
      purchaseDate: new Date(DUPLICATE_PREPAYMENT.dateISO + "T00:00:00Z"),
    },
  });
  const duplicate = prepays.find((p) => decimalToCents(String(p.amount)) === DUPLICATE_PREPAYMENT.cents);

  const privalia = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: monthToDate(AUGUST), description: CENT_FIX.description },
  });
  const wrongCent = privalia.find((p) => decimalToCents(String(p.amount)) === CENT_FIX.fromCents);

  const missing: typeof SEPTEMBER_MISSING = [];
  for (const row of SEPTEMBER_MISSING) {
    const [dateISO, description] = row;
    const existing = await prisma.cardTransaction.findFirst({
      where: {
        cardId: card.id,
        month: monthToDate(SEPTEMBER),
        description,
        purchaseDate: new Date(dateISO + "T00:00:00Z"),
      },
    });
    if (!existing) missing.push(row);
  }

  const augustBefore = await extractCents(card.id, AUGUST);
  const septemberBefore = await extractCents(card.id, SEPTEMBER);

  console.log("PLANO");
  console.log(`  cartão: vencimento ${card.dueDay} → ${DUE_DAY}${card.dueDay === DUE_DAY ? " (já ok)" : ""}`);
  console.log(
    `  agosto: ${duplicate ? `remover antecipação duplicada de ${formatCents(DUPLICATE_PREPAYMENT.cents)}` : "antecipação duplicada já removida"}`,
  );
  console.log(
    `  agosto: ${wrongCent ? `"${CENT_FIX.description}" ${formatCents(CENT_FIX.fromCents)} → ${formatCents(CENT_FIX.toCents)}` : `"${CENT_FIX.description}" já em ${formatCents(CENT_FIX.toCents)}`}`,
  );
  console.log(`  setembro: inserir ${missing.length} de ${SEPTEMBER_MISSING.length} compras de 04/08`);
  for (const [, description, cents] of missing) console.log(`      + ${description} · ${formatCents(cents)}`);

  // ---------- 2. Projeção dos totais e validação ANTES de escrever ----------
  const augustAfter =
    augustBefore -
    (duplicate ? DUPLICATE_PREPAYMENT.cents : 0) +
    (wrongCent ? CENT_FIX.toCents - CENT_FIX.fromCents : 0);
  const septemberAfter = septemberBefore + missing.reduce((a, [, , cents]) => a + cents, 0);

  console.log("\nPROJEÇÃO");
  for (const [month, before, after, expected] of [
    [AUGUST, augustBefore, augustAfter, EXPECTED_AUGUST_CENTS],
    [SEPTEMBER, septemberBefore, septemberAfter, EXPECTED_SEPTEMBER_CENTS],
  ] as const) {
    console.log(
      `  ${month}: ${formatCents(before)} → ${formatCents(after)} · documento ${formatCents(expected)} · diff ${formatCents(after - expected)}`,
    );
  }
  if (augustAfter !== EXPECTED_AUGUST_CENTS || septemberAfter !== EXPECTED_SEPTEMBER_CENTS) {
    throw new Error("A projeção não fecha com os documentos do banco — nada foi gravado. Revisar a transcrição.");
  }
  console.log("  ✓ projeção fecha nos centavos com a fatura e o CSV");

  if (!APPLY) {
    console.log("\nSimulação concluída. Rode com --apply para gravar.");
    return;
  }

  // ---------- 3. Escrita ----------
  console.log("\nAPLICANDO");
  if (card.dueDay !== DUE_DAY) {
    await prisma.creditCard.update({ where: { id: card.id }, data: { dueDay: DUE_DAY } });
    console.log(`  cartão: vencimento → ${DUE_DAY}`);
  }
  if (duplicate) {
    await prisma.cardTransaction.delete({ where: { id: duplicate.id } });
    console.log(`  agosto: antecipação duplicada removida`);
  }
  if (wrongCent) {
    await prisma.cardTransaction.update({
      where: { id: wrongCent.id },
      data: { amount: centsToNumber(CENT_FIX.toCents) },
    });
    console.log(`  agosto: centavo da parcela da Privalia corrigido`);
  }
  if (missing.length > 0) {
    await prisma.cardTransaction.createMany({
      data: missing.map(([dateISO, description, cents]) => ({
        cardId: card.id,
        month: monthToDate(SEPTEMBER),
        description,
        amount: centsToNumber(cents),
        purchaseDate: new Date(dateISO + "T00:00:00Z"),
      })),
    });
    console.log(`  setembro: ${missing.length} compras inseridas`);
  }

  // ---------- 4. Consolidado = soma líquida do extrato, e reconferência -----
  for (const [month, expected] of [
    [AUGUST, EXPECTED_AUGUST_CENTS],
    [SEPTEMBER, EXPECTED_SEPTEMBER_CENTS],
  ] as const) {
    const totalCents = await extractCents(card.id, month);
    await upsertCardEntry({ card: cardRef, month, amountCents: totalCents, mode: "set" });
    const diff = totalCents - expected;
    console.log(
      `  ${month}: consolidado ${formatCents(totalCents)} · documento ${formatCents(expected)} · diff ${formatCents(diff)}`,
    );
    if (diff !== 0) throw new Error(`${month} não fechou com o documento do banco (diff ${formatCents(diff)}).`);
  }

  console.log("\nOK: agosto e setembro fecham nos centavos com a fatura e o CSV do Nubank.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
