// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate, monthRange } from "@/lib/dates";
import { formatCents, decimalToCents } from "@/lib/money";
import { upsertCardEntry } from "@/lib/card-entry";

/**
 * Remove a cauda de parcelamento DUPLICADA que a importação da fatura Bradesco
 * de 28/08/2026 criou, para rodar UMA vez.
 *
 * 12 compras do ciclo novo já estavam no app pelo caminho curto (nome como vem
 * no aviso do banco, sem a cidade, e parcela = total ÷ nº de parcelas: 435,90 ÷
 * 10 = 43,59). A fatura trouxe as mesmas compras com o nome do seller mais a
 * cidade e o valor real da parcela (43,61). O casamento de linha exigia valor
 * EXATO, nenhuma casou, e cada uma virou "parcela atrasada": o plano deslocou um
 * mês e `reconcileTail` gerou a cauda inteira 01..N ao lado da cauda correta
 * 02..N da fatura. Corrigido no código na v1.14.2 (3º passe de `findOrphans`).
 *
 * As duplicatas se distinguem por três marcas ao mesmo tempo: competência
 * posterior à da fatura, parcela nas colunas e descrição SEM a cidade — a fatura
 * sempre traz cidade, e nenhuma linha do cartão tinha texto sem cidade antes
 * desta importação (verificado em todo o histórico).
 *
 * Confere contagem e total contra o medido antes de apagar; se o banco não
 * estiver nesse estado, aborta em vez de adivinhar (o app é usado ao vivo).
 * Nada é tocado na competência da fatura, que já está fechada.
 *
 * Uso: npx tsx scripts/limpa-cauda-duplicada-bradesco.ts           (simula)
 *      npx tsx scripts/limpa-cauda-duplicada-bradesco.ts --apply   (grava)
 */

const APPLY = process.argv.includes("--apply");

/** Competência da fatura importada: intocável (fechada e paga). */
const FATURA_MONTH = "2026-09";
/** Meses a recalcular: a cauda duplicada ia de out/2026 a jul/2027. */
const MONTHS = monthRange("2026-09", "2027-07");
/** Medido em 28/08/2026, antes de gravar. */
const EXPECTED_ROWS = 86;
const EXPECTED_CENTS = 337261;

const hasCity = (text: string) => /SAO PAULO|SÃO PAULO/i.test(text);

async function main() {
  console.log(APPLY ? "=== APLICANDO ===\n" : "=== SIMULAÇÃO (use --apply para gravar) ===\n");
  const card = await prisma.creditCard.findFirstOrThrow({
    where: { name: { contains: "Bradesco" } },
    select: { id: true, name: true, closingDay: true, dueDay: true },
  });

  const rows = await prisma.cardTransaction.findMany({
    where: { cardId: card.id, month: { gte: monthToDate(FATURA_MONTH) }, installmentSeq: { not: null } },
    select: {
      id: true, month: true, description: true, bankDescription: true,
      amount: true, installmentSeq: true, installmentCount: true, prepayment: true,
    },
    orderBy: [{ month: "asc" }],
  });
  const suspects = rows.filter((r) => !hasCity(r.bankDescription ?? r.description));

  // Guardas: o mês da fatura não entra, e o estado tem que ser o medido.
  const inFatura = suspects.filter((r) => r.month.getTime() === monthToDate(FATURA_MONTH).getTime());
  const prepaid = suspects.filter((r) => r.prepayment);
  const totalCents = suspects.reduce((a, r) => a + decimalToCents(String(r.amount)), 0);

  const problems: string[] = [];
  if (inFatura.length > 0) problems.push(`${inFatura.length} linha(s) na competência da fatura (${FATURA_MONTH})`);
  if (prepaid.length > 0) problems.push(`${prepaid.length} linha(s) marcada(s) como antecipação`);
  if (suspects.length !== EXPECTED_ROWS) problems.push(`esperava ${EXPECTED_ROWS} linhas, achei ${suspects.length}`);
  if (totalCents !== EXPECTED_CENTS)
    problems.push(`esperava ${formatCents(EXPECTED_CENTS)} no total, achei ${formatCents(totalCents)}`);
  if (problems.length > 0) {
    console.log("ABORTA — o cartão não está no estado medido:");
    for (const p of problems) console.log(`  - ${p}`);
    console.log("\nNada foi apagado. Reveja antes de insistir.");
    return;
  }

  for (const r of suspects) {
    console.log(
      `apagar  ${r.month.toISOString().slice(0, 7)}  ${(r.bankDescription ?? r.description).padEnd(34)}` +
        ` ${formatCents(decimalToCents(String(r.amount))).padStart(10)}  parcela ${r.installmentSeq}/${r.installmentCount}`,
    );
  }
  console.log(`\n${suspects.length} linhas, ${formatCents(totalCents)}`);

  if (!APPLY) {
    console.log("\n(simulação: consolidado não recalculado)");
    return;
  }

  const { count } = await prisma.cardTransaction.deleteMany({ where: { id: { in: suspects.map((r) => r.id) } } });
  console.log(`\n${count} linha(s) apagada(s). Recalculando o consolidado...\n`);

  console.log("mês        extrato   consolidado");
  for (const month of MONTHS) {
    const agg = await prisma.cardTransaction.aggregate({
      where: { cardId: card.id, month: monthToDate(month) },
      _sum: { amount: true },
    });
    const cents = agg._sum.amount ? decimalToCents(String(agg._sum.amount)) : 0;
    const { totalCents: entry } = await upsertCardEntry({ card, month, amountCents: cents, mode: "set" });
    const nota = cents === 0 ? "  (mês vazio: consolidado removido)" : "";
    console.log(`${month}  ${formatCents(cents).padStart(11)}  ${formatCents(entry).padStart(12)}${nota}`);
  }
}

main().then(() => process.exit(0));
