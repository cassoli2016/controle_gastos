// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { replaceCardMonth, type CardMonthRow } from "@/lib/card-entry";

/**
 * Fatura REAL do Bradesco Amazon fechada em 27/07/2026 (vence 10/08 →
 * competência ago/2026): substitui a projeção importada da planilha pelas
 * linhas transcritas do PDF da fatura.
 *
 * Convenções (mesmas do CSV do Nubank):
 * - "PAGAMENTO RECEBIDO" (pagamento da fatura anterior) fica de fora;
 * - estorno entra como linha NEGATIVA e abate o total;
 * - descrições verbatim da fatura, incluindo o marcador "(parcela/total)".
 *
 * Total esperado: R$ 1.492,25 de compras − R$ 363,93 de estorno = R$ 1.128,32
 * (bate com "Total da fatura" do PDF). Divergência aborta antes de gravar.
 *
 * Idempotente: replaceCardMonth apaga o extrato do mês (menos antecipações) e
 * DEFINE o consolidado — rodar de novo produz o mesmo estado.
 *
 * Uso: npx tsx scripts/fix-fatura-ago-bradesco.ts
 */

const MONTH = "2026-08";
const EXPECTED_TOTAL_CENTS = 112832; // R$ 1.128,32

// [dataISO, descrição, centavos] — compras de nov/2025 a jul/2026 (parcelas
// correntes + compras do ciclo); negativo = estorno.
const LINES: [string, string, number][] = [
  ["2025-11-21", "AMAZON RETAIL CPI SAO PAULO(09/12)", 1594],
  ["2025-11-23", "AMAZON RETAIL CPI SAO PAULO(09/12)", 715],
  ["2025-12-28", "AMAZONMKTPLC*GAMERPLAC SAO PAULO(07/14)", 10350],
  ["2026-01-29", "AMAZON BR SAO PAULO(06/08)", 2148],
  ["2026-02-02", "AMAZON BR SAO PAULO(06/07)", 2055],
  ["2026-02-07", "AMAZONMKTPLC*ANKERINNO SAO PAULO(06/06)", 2069],
  ["2026-02-11", "AMAZON BR SAO PAULO(06/07)", 2170],
  ["2026-02-26", "AMAZON BR SAO PAULO(05/05)", 1150],
  ["2026-02-28", "AMAZON BR SAO PAULO(05/05)", 1535],
  ["2026-03-04", "AMAZONMKTPLC*DISTRIBUI SAO PAULO(05/05)", 1238],
  ["2026-03-15", "AMAZON BR SAO PAULO(05/07)", 2075],
  ["2026-03-23", "AMAZON MARKETPLACE SAO PAULO(05/11)", 2086],
  ["2026-03-28", "AMAZON BR SAO PAULO(04/05)", 1063],
  ["2026-03-28", "AMAZON BR SAO PAULO(04/05)", 1010],
  ["2026-04-09", "AMAZON BR SAO PAULO(04/05)", 1599],
  ["2026-04-09", "AMAZONMKTPLC*DIOGENESF SAO PAULO(04/10)", 14894],
  ["2026-04-11", "AMAZON BR SAO PAULO(04/08)", 2199],
  ["2026-04-12", "AMAZONMKTPLC*MANZIACOM SAO PAULO(04/12)", 2180],
  ["2026-04-14", "AMAZONMKTPLC*LFDEMENDO SAO PAULO(04/05)", 1766],
  ["2026-04-21", "AMAZONMKTPLC*ATIVACOME SAO PAULO(04/05)", 1916],
  ["2026-04-21", "AMAZON BR SAO PAULO(04/06)", 1841],
  ["2026-04-30", "AMAZONMKTPLC*LADIGITAL SAO PAULO(03/05)", 1836],
  ["2026-05-02", "AMAZON BR SAO PAULO(03/10)", 5156],
  ["2026-05-03", "AMAZONMKTPLC*DAMCOMERC SAO PAULO(03/10)", 3138],
  ["2026-05-04", "AMAZONMKTPLC*ATIVACOME SAO PAULO(03/06)", 4000],
  ["2026-05-07", "AMAZON BR SAO PAULO(03/05)", 1519],
  ["2026-05-14", "AMAZONMKTPLC*EASYTECHC SAO PAULO(03/12)", 3492],
  ["2026-05-24", "AMAZONMKTPLC*RIVIERAFI SAO PAULO(02/05)", 1799],
  ["2026-05-24", "AMAZONMKTPLC*MULTIPREC SAO PAULO(02/05)", 1799],
  ["2026-05-24", "AMAZONMKTPLC*SILVEIRAG SAO PAULO(02/05)", 1278],
  ["2026-05-24", "AMAZON BR SAO PAULO(02/03)", 1266],
  ["2026-05-27", "AMAZON BR SAO PAULO(02/04)", 1019],
  ["2026-07-05", "AMAZON BR SAO PAULO(01/05)", 1368],
  ["2026-07-09", "AMAZONMKTPLC*NOGORACOM SAO PAULO(01/10)", 2165],
  ["2026-07-10", "AMAZON MARKETPLACE SAO PAULO(01/10)", 5986],
  ["2026-07-11", "AMAZON MARKETPLACE SAO PAULO(01/10)", 5030],
  ["2026-07-11", "AMAZON MARKETPLACE SAO PAULO(01/10)", 28247],
  ["2026-07-13", "AMAZONMKTPLC*VICTORSTE SAO PAULO(01/04)", 1199],
  ["2026-07-13", "AMAZON MARKETPLACE SAO PAULO(01/10)", -36393],
  ["2026-07-14", "AMAZON MARKETPLACE SAO PAULO(01/10)", 3272],
  ["2026-07-14", "AMAZONMKTPLC*CHAGASECA SAO PAULO(01/10)", 2495],
  ["2026-07-15", "AMAZONMKTPLC*PFTRADING SAO PAULO(01/05)", 1780],
  ["2026-07-17", "AMAZONMKTPLC*RFGARCIAC SAO PAULO(01/05)", 1398],
  ["2026-07-18", "AMAZON BR SAO PAULO(01/06)", 2116],
  ["2026-07-25", "AMAZON MARKETPLACE SAO PAULO(01/10)", 4738],
  ["2026-07-25", "AMAZON MARKETPLACE SAO PAULO(01/10)", 5476],
];

async function main() {
  const sum = LINES.reduce((acc, [, , cents]) => acc + cents, 0);
  if (sum !== EXPECTED_TOTAL_CENTS) {
    throw new Error(
      `Transcrição não bate com o total da fatura: ${formatCents(sum)} ≠ ${formatCents(EXPECTED_TOTAL_CENTS)}.`,
    );
  }

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: "bradesco", mode: "insensitive" } },
  });
  if (!card) throw new Error("Cartão Bradesco não encontrado no banco.");

  const rows: CardMonthRow[] = LINES.map(([dateISO, description, amountCents]) => ({
    description,
    amountCents,
    dateISO,
  }));
  const { totalCents } = await replaceCardMonth(
    { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
    MONTH,
    rows,
  );

  console.log(`Fatura ${MONTH} de "${card.name}" substituída: ${rows.length} linhas · total ${formatCents(totalCents)}.`);
  if (totalCents !== EXPECTED_TOTAL_CENTS) {
    console.warn(
      `ATENÇÃO: total gravado difere do esperado (${formatCents(EXPECTED_TOTAL_CENTS)}) — há antecipação preservada no mês?`,
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
