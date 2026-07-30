// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, monthRange } from "@/lib/dates";
import { formatCents, decimalToCents, centsToNumber } from "@/lib/money";
import { upsertCardEntry } from "@/lib/card-entry";

/**
 * Reconstrói as faturas FUTURAS do Bradesco (set/2026..jun/2027) a partir do
 * cronograma de parcelas da fatura real fechada em 27/07/2026 (ver
 * `scripts/fix-fatura-ago-bradesco.ts` e `docs/fatura-bradesco-pdf.md`).
 *
 * Cada linha "(pp/tt)" da fatura implica parcelas pp+1..tt nas faturas
 * seguintes, com o mesmo valor. Substitui tanto a projeção da planilha
 * (linhas sem data) quanto parcelas lançadas à mão que a fatura agora cobre.
 *
 * PRESERVADAS: linhas com purchaseDate > 27/07/2026 (compras do ciclo NOVO,
 * que não estão na fatura fechada — ex.: AMAZON BR 10x de 30/07) e
 * antecipações (prepayment).
 *
 * O estorno "(01/10)" de 363,93 cancelou o parcelamento inteiro: nenhuma
 * parcela futura dele é gerada — confirmado pelo "Total parcelado para as
 * próximas faturas" do PDF (R$ 9.060,75), que bate com o cronograma daqui a
 * menos de R$ 5 (ajustes de centavos do próprio Bradesco).
 *
 * Idempotente: linhas derivadas têm data de compra <= 27/07 e são
 * regeneradas; as preservadas nunca são tocadas.
 *
 * Uso: npx tsx scripts/fix-faturas-futuras-bradesco.ts
 */

const FIRST_FATURA = "2026-08"; // competência da fatura fechada (parcela "pp" mora aqui)
const REBUILD_RANGE = monthRange("2026-09", "2027-06");
const CUTOFF_DATE = new Date("2026-07-27T23:59:59Z"); // fechamento: depois disso é ciclo novo
const EXPECTED_NEXT_CENTS = 143198; // PDF: "Próxima fatura R$ 1.431,98"
const EXPECTED_TOTAL_CENTS = 906075; // PDF: "Total para as próximas faturas R$ 9.060,75"
const TOLERANCE_CENTS = 500; // ajustes de centavos nas parcelas finais (Bradesco)

// Linhas de COMPRA da fatura fechada (estorno fora: parcelamento cancelado).
// [dataISO da compra, descrição verbatim com marcador (pp/tt), centavos].
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
  ["2026-07-14", "AMAZON MARKETPLACE SAO PAULO(01/10)", 3272],
  ["2026-07-14", "AMAZONMKTPLC*CHAGASECA SAO PAULO(01/10)", 2495],
  ["2026-07-15", "AMAZONMKTPLC*PFTRADING SAO PAULO(01/05)", 1780],
  ["2026-07-17", "AMAZONMKTPLC*RFGARCIAC SAO PAULO(01/05)", 1398],
  ["2026-07-18", "AMAZON BR SAO PAULO(01/06)", 2116],
  ["2026-07-25", "AMAZON MARKETPLACE SAO PAULO(01/10)", 4738],
  ["2026-07-25", "AMAZON MARKETPLACE SAO PAULO(01/10)", 5476],
];

const MARKER_RE = /\((\d{2})\/(\d{2})\)/;

function shiftMonth(month: string, delta: number): string {
  const d = monthToDate(month);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return monthStringFromDate(d);
}

/** Parcelas futuras derivadas: mês → linhas {dateISO, description, cents}. */
function buildSchedule(): Map<string, { dateISO: string; description: string; cents: number }[]> {
  const byMonth = new Map<string, { dateISO: string; description: string; cents: number }[]>();
  for (const [dateISO, description, cents] of LINES) {
    const m = MARKER_RE.exec(description);
    if (!m) continue; // sem marcador = à vista, nada a projetar
    const [pp, tt] = [Number(m[1]), Number(m[2])];
    for (let k = pp + 1; k <= tt; k++) {
      const month = shiftMonth(FIRST_FATURA, k - pp);
      const desc = description.replace(MARKER_RE, `(${String(k).padStart(2, "0")}/${String(tt).padStart(2, "0")})`);
      const list = byMonth.get(month) ?? [];
      list.push({ dateISO, description: desc, cents });
      byMonth.set(month, list);
    }
  }
  return byMonth;
}

async function main() {
  const schedule = buildSchedule();

  // Validação contra os totais do próprio PDF antes de tocar no banco.
  const nextCents = (schedule.get(REBUILD_RANGE[0]) ?? []).reduce((a, r) => a + r.cents, 0);
  const totalCents = [...schedule.values()].flat().reduce((a, r) => a + r.cents, 0);
  console.log(
    `próxima fatura (cronograma): ${formatCents(nextCents)} · PDF ${formatCents(EXPECTED_NEXT_CENTS)} · diff ${formatCents(nextCents - EXPECTED_NEXT_CENTS)}`,
  );
  console.log(
    `total próximas faturas: ${formatCents(totalCents)} · PDF ${formatCents(EXPECTED_TOTAL_CENTS)} · diff ${formatCents(totalCents - EXPECTED_TOTAL_CENTS)}`,
  );
  if (Math.abs(nextCents - EXPECTED_NEXT_CENTS) > TOLERANCE_CENTS || Math.abs(totalCents - EXPECTED_TOTAL_CENTS) > TOLERANCE_CENTS) {
    throw new Error("Cronograma diverge do PDF além da tolerância — revisar transcrição.");
  }

  const card = await prisma.creditCard.findFirst({
    where: { active: true, name: { contains: "bradesco", mode: "insensitive" } },
  });
  if (!card) throw new Error("Cartão Bradesco não encontrado no banco.");

  for (const month of REBUILD_RANGE) {
    const monthDate = monthToDate(month);
    const derived = schedule.get(month) ?? [];

    // Fora: projeção da planilha (sem data) e parcelas manuais que a fatura
    // agora cobre (compra até o fechamento). Ficam: ciclo novo e antecipações.
    await prisma.cardTransaction.deleteMany({
      where: {
        cardId: card.id,
        month: monthDate,
        prepayment: false,
        OR: [{ purchaseDate: null }, { purchaseDate: { lte: CUTOFF_DATE } }],
      },
    });
    if (derived.length > 0) {
      await prisma.cardTransaction.createMany({
        data: derived.map((r) => ({
          cardId: card.id,
          month: monthDate,
          description: r.description,
          amount: centsToNumber(r.cents),
          purchaseDate: new Date(r.dateISO + "T00:00:00Z"),
        })),
      });
    }

    // Consolidado = soma líquida do extrato do mês (inclui preservadas).
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthDate },
      _sum: { amount: true },
    });
    const monthTotal = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    await upsertCardEntry({
      card: { id: card.id, name: card.name, closingDay: card.closingDay, dueDay: card.dueDay },
      month,
      amountCents: monthTotal,
      mode: "set",
    });
    console.log(`${month}: ${derived.length} parcelas do cronograma · consolidado ${formatCents(monthTotal)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
