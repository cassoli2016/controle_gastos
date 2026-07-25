// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents } from "@/lib/money";

/**
 * Ajuste único (2026-07-25): duas sobras de dados em jul/2026.
 *
 * (1) Consolidado "Bradesco Amazon" em jul/26 com previsto R$ 0,00 — restou de
 *     quando as compras de 25/07 foram movidas à mão para a fatura de agosto
 *     (o cartão fecha 27/07 e vence 10/08). Aparecia como linha zerada no
 *     Panorama. A regra nova de upsertCardEntry evita que reapareça.
 * (2) Extrato do Nubank em jul/26: duplicatas exatas (descrição + valor) das
 *     linhas de ago/26, sem consolidado correspondente — a tela Cartões de
 *     julho mostrava "Fatura do mês R$ 0,00" com dezenas de linhas embaixo.
 *
 * Idempotente: rodar de novo não faz nada. Se alguma linha de julho NÃO tiver
 * par em agosto, aborta sem apagar nada (sinal de que não é duplicata).
 *
 * Uso: npx tsx scripts/fix-fatura-jul.ts
 */
async function main() {
  const july = monthToDate("2026-07");
  const august = monthToDate("2026-08");

  // (1) Consolidados de cartão zerados e não pagos em julho.
  const cardEntries = await prisma.monthlyEntry.findMany({
    where: { month: july, cardId: { not: null }, paid: false },
    include: { card: true },
  });
  let removedEntries = 0;
  for (const e of cardEntries) {
    if (decimalToCents(String(e.plannedAmount)) !== 0) continue;
    const remaining = await prisma.cardTransaction.count({ where: { cardId: e.cardId!, month: july } });
    if (remaining > 0) {
      console.log(`(1) "${e.card?.name}" está zerado em jul/26 mas tem ${remaining} linha(s) de extrato — preservado.`);
      continue;
    }
    await prisma.monthlyEntry.delete({ where: { id: e.id } });
    removedEntries++;
    console.log(`(1) consolidado zerado removido: "${e.card?.name}" jul/26.`);
  }
  if (removedEntries === 0) console.log("(1) nenhum consolidado zerado para remover em jul/26.");

  // (2) Extrato do Nubank em jul/26 duplicado de ago/26.
  const nubank = await prisma.creditCard.findFirst({
    where: { name: { contains: "nubank", mode: "insensitive" } },
  });
  if (!nubank) {
    console.log("(2) cartão Nubank não encontrado — nada a fazer.");
    return;
  }
  const julyTx = await prisma.cardTransaction.findMany({ where: { cardId: nubank.id, month: july } });
  if (julyTx.length === 0) {
    console.log("(2) nenhuma linha de extrato do Nubank em jul/26 — nada a fazer.");
    return;
  }
  // Antecipação manual de fatura: nunca apagar, mesmo que coincida em
  // descrição+valor com uma linha de agosto — é dado precioso preservado
  // pelo resto do sistema quando o CSV substitui o mês.
  const prepayments = julyTx.filter((t) => t.prepayment);
  if (prepayments.length > 0) {
    throw new Error(
      `(2) ${prepayments.length} linha(s) de jul/26 são prepayment (antecipação manual) — abortado sem apagar nada.`,
    );
  }
  const augustTx = await prisma.cardTransaction.findMany({ where: { cardId: nubank.id, month: august } });
  const key = (t: { description: string; amount: unknown }) => `${t.description}|${String(t.amount)}`;
  // Multiset: cada chave de agosto só pode "casar" com uma linha de julho.
  // Um Set testaria só pertencimento — com chaves repetidas em agosto (ex.:
  // duas recargas de mesmo valor no mês), isso deixaria passar linhas de
  // julho em excesso que não são duplicatas 1-para-1.
  const augustCounts = new Map<string, number>();
  for (const t of augustTx) augustCounts.set(key(t), (augustCounts.get(key(t)) ?? 0) + 1);
  const duplicadas: typeof julyTx = [];
  for (const t of julyTx) {
    const k = key(t);
    const remaining = augustCounts.get(k) ?? 0;
    if (remaining > 0) {
      augustCounts.set(k, remaining - 1);
      duplicadas.push(t);
    }
  }
  if (duplicadas.length !== julyTx.length) {
    throw new Error(
      `(2) ${julyTx.length - duplicadas.length} de ${julyTx.length} linhas do Nubank em jul/26 não têm par em ago/26 — abortado sem apagar nada.`,
    );
  }
  const { count } = await prisma.cardTransaction.deleteMany({ where: { id: { in: duplicadas.map((t) => t.id) } } });
  console.log(`(2) ${count} linhas de extrato do Nubank em jul/26 removidas (duplicatas exatas de ago/26).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
