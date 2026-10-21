// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { decimalToCents, formatCents } from "@/lib/money";
import { upsertCardEntry, type CardRef } from "@/lib/card-entry";
import { descriptionsMatch } from "@/lib/description-match";

/**
 * Correções de dados da auditoria de 2026-10-20 (ver docs/log.md e a entrada
 * 1.36.0 do changelog). Simula por padrão; grava só com --apply. Cada passo
 * relê o dado na hora de gravar e pula o que já estiver como deveria — rodar
 * duas vezes não faz nada na segunda.
 *
 *   npx tsx scripts/fix-auditoria-2026-10.ts            # simulação
 *   npx tsx scripts/fix-auditoria-2026-10.ts --apply    # grava
 *
 * 1. Retirada avulsa de 08/10 (R$ 1.022,77) ganha o vínculo com a caixinha
 *    (withdrawFromReserve nascia sem reserveBoxId — corrigido no código).
 * 2. Assinaturas YouTube Premium, Nucel e iCloud: religadas com o texto da
 *    fatura; as linhas de out/2026 são consumidas (a cobrança já está na
 *    fatura do Nubank) e as cobranças ganham a etiqueta da assinatura.
 * 3. YouTube Premium de ago/2026: valor pago 53,90 → 0 (a cobrança está na
 *    fatura paga; contava duas vezes na sobra realizada).
 * 4. BYD: dois veículos, o mesmo serviço — a cauda do segundo (parcelas 2..6
 *    de dez/2026 a abr/2027, R$ 130,58 e R$ 166,67) estava faltando.
 * 5. Investidor10 está arquivado mas tinha provisões em aberto em 2027/2028.
 */

const APPLY = process.argv.includes("--apply");
const log = (s: string) => console.log(s);

async function main() {
  log(APPLY ? "MODO: APLICAR" : "MODO: SIMULAÇÃO (use --apply para gravar)");

  // ───────────────────────── 1. retirada sem caixinha ─────────────────────
  log("\n[1] Retirada avulsa sem reserveBoxId");
  const box = await prisma.reserveBox.findFirst({ where: { name: "Cristian Cassoli" } });
  if (!box) throw new Error("caixinha não encontrada");
  const semBox = await prisma.monthlyEntry.findMany({
    where: { reserveBoxId: null, description: `Retirada · ${box.name}`, month: monthToDate("2026-10") },
  });
  for (const m of semBox) {
    log(`  ${m.paidDate?.toISOString().slice(0, 10)} ${m.description} ${formatCents(decimalToCents(String(m.paidAmount ?? m.plannedAmount)))} → reserveBoxId=${box.name}`);
    if (APPLY) await prisma.monthlyEntry.update({ where: { id: m.id }, data: { reserveBoxId: box.id } });
  }
  if (semBox.length === 0) log("  nada a fazer");

  // ───────────────────────── 2. assinaturas ────────────────────────────────
  log("\n[2] Assinaturas: religar com o texto da fatura e consumir out/2026");
  const nubank = await prisma.creditCard.findFirst({ where: { name: { contains: "Nubank" } } });
  if (!nubank) throw new Error("cartão Nubank não encontrado");
  const subsSpec: { description: string; bankDescription: string; amount: number }[] = [
    { description: "YouTube Premium", bankDescription: "Google Youtubepremium", amount: 53.9 },
    { description: "Nucel", bankDescription: "Plano NuCel", amount: 50 },
    { description: "iCloud", bankDescription: "Apple.Com/Bill", amount: 19.9 },
  ];
  const out = monthToDate("2026-10");
  for (const spec of subsSpec) {
    const sub = await prisma.cardSubscription.findFirst({
      where: { cardId: nubank.id, itemId: { not: null }, description: { equals: spec.description, mode: "insensitive" } },
      include: { item: true },
    });
    if (!sub || !sub.itemId) {
      log(`  ✗ assinatura "${spec.description}" com item não encontrada — pulando`);
      continue;
    }
    const precisa = !sub.active || sub.bankDescription !== spec.bankDescription || Number(sub.amount) !== spec.amount;
    log(`  ${spec.description}: ativa=${sub.active} banco="${sub.bankDescription ?? "—"}" valor=${sub.amount} → ativa, "${spec.bankDescription}", ${spec.amount}${precisa ? "" : " (já está)"}`);
    if (APPLY && precisa) {
      await prisma.cardSubscription.update({
        where: { id: sub.id },
        data: { active: true, bankDescription: spec.bankDescription, amount: spec.amount },
      });
    }
    // Cobrança de outubro no extrato → etiqueta da assinatura.
    const txs = await prisma.cardTransaction.findMany({ where: { cardId: nubank.id, month: out, amount: { gt: 0 } } });
    const charge = txs.find((t) => descriptionsMatch(spec.bankDescription, t.bankDescription ?? t.description));
    if (!charge) {
      log(`    sem cobrança em out/2026 no extrato — linha do mês fica como está`);
      continue;
    }
    log(`    cobrança: "${charge.description}" ${formatCents(decimalToCents(String(charge.amount)))} em ${charge.purchaseDate?.toISOString().slice(0, 10)} subscriptionId=${charge.subscriptionId ? "já" : "→ marcar"}`);
    if (APPLY && charge.subscriptionId !== sub.id) {
      await prisma.cardTransaction.update({ where: { id: charge.id }, data: { subscriptionId: sub.id } });
    }
    // Linha provisionada de outubro: consumida (previsto 0, paga, valor pago 0).
    const entry = await prisma.monthlyEntry.findUnique({ where: { itemId_month: { itemId: sub.itemId, month: out } } });
    if (!entry) {
      log(`    sem linha provisionada em out/2026`);
      continue;
    }
    const planned = decimalToCents(String(entry.plannedAmount));
    const paidAmt = entry.paidAmount === null ? null : decimalToCents(String(entry.paidAmount));
    const jaConsumida = entry.paid && planned === 0 && paidAmt === 0;
    log(`    linha out/2026: previsto ${formatCents(planned)} paga=${entry.paid} valor pago ${paidAmt === null ? "—" : formatCents(paidAmt)} → previsto R$ 0,00, paga, valor pago R$ 0,00${jaConsumida ? " (já está)" : ""}`);
    if (APPLY && !jaConsumida) {
      await prisma.monthlyEntry.update({
        where: { id: entry.id },
        data: {
          plannedAmount: 0,
          paid: true,
          paidAmount: 0,
          paidDate: entry.paidDate ?? charge.purchaseDate ?? new Date("2026-10-20T00:00:00Z"),
        },
      });
    }
  }

  // ───────────────────────── 3. YouTube ago/2026 ───────────────────────────
  log("\n[3] YouTube Premium ago/2026: valor pago da linha consumida");
  const yt = await prisma.item.findFirst({ where: { name: { equals: "YouTube Premium", mode: "insensitive" } } });
  if (yt) {
    const ago = await prisma.monthlyEntry.findUnique({ where: { itemId_month: { itemId: yt.id, month: monthToDate("2026-08") } } });
    if (ago && ago.paid && decimalToCents(String(ago.plannedAmount)) === 0 && ago.paidAmount !== null && decimalToCents(String(ago.paidAmount)) !== 0) {
      log(`  previsto 0, valor pago ${formatCents(decimalToCents(String(ago.paidAmount)))} → R$ 0,00`);
      if (APPLY) await prisma.monthlyEntry.update({ where: { id: ago.id }, data: { paidAmount: 0 } });
    } else log("  nada a fazer");
  }

  // ───────────────────────── 4. BYD: cauda do segundo veículo ──────────────
  log("\n[4] BYD: cauda do segundo veículo (dez/2026 a abr/2027)");
  const card: CardRef = { id: nubank.id, name: nubank.name, closingDay: nubank.closingDay, dueDay: nubank.dueDay };
  const gemeos = [130.58, 166.67];
  const meses = ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04"];
  let addCents = 0;
  for (const [i, m] of meses.entries()) {
    const seq = i + 2;
    const monthDate = monthToDate(m);
    let somaMes = 0;
    for (const amount of gemeos) {
      const existentes = await prisma.cardTransaction.count({
        where: {
          cardId: nubank.id,
          month: monthDate,
          description: { contains: "Byd Sao Jose", mode: "insensitive" },
          installmentSeq: seq,
          installmentCount: 6,
          amount: { gte: amount - 0.1, lte: amount + 0.1 },
        },
      });
      if (existentes >= 2) {
        log(`  ${m} ${seq}/6 ${formatCents(Math.round(amount * 100))}: já há ${existentes} linhas — pulando`);
        continue;
      }
      log(`  ${m} ${seq}/6 ${formatCents(Math.round(amount * 100))}: ${existentes} linha → inserir a gêmea`);
      somaMes += Math.round(amount * 100);
      if (APPLY) {
        await prisma.cardTransaction.create({
          data: {
            cardId: nubank.id,
            month: monthDate,
            description: "Byd Sao Jose",
            amount,
            purchaseDate: new Date("2026-10-08T00:00:00Z"),
            installmentSeq: seq,
            installmentCount: 6,
          },
        });
      }
    }
    if (somaMes > 0) {
      addCents += somaMes;
      log(`    consolidado ${nubank.name} ${m}: +${formatCents(somaMes)}`);
      if (APPLY) await upsertCardEntry({ card, month: m, amountCents: somaMes, mode: "add" });
    }
  }
  log(`  total adicionado às faturas futuras: ${formatCents(addCents)}`);

  // ───────────────────────── 5. Investidor10 arquivado ─────────────────────
  log("\n[5] Investidor10: provisões em aberto de item arquivado");
  const inv10 = await prisma.item.findFirst({ where: { name: { equals: "Investidor10", mode: "insensitive" }, active: false } });
  if (inv10) {
    const abertas = await prisma.monthlyEntry.findMany({ where: { itemId: inv10.id, paid: false, month: { gte: monthToDate("2026-10") } } });
    log(`  ${abertas.length} lançamentos em aberto (${formatCents(abertas.reduce((a, e) => a + decimalToCents(String(e.plannedAmount)), 0))}): ${abertas.map((e) => monthStringFromDate(e.month)).join(", ")} → excluir`);
    if (APPLY && abertas.length > 0) await prisma.monthlyEntry.deleteMany({ where: { id: { in: abertas.map((e) => e.id) } } });
  } else log("  item arquivado não encontrado — nada a fazer");

  log(APPLY ? "\nAPLICADO." : "\nSimulação concluída. Nada foi gravado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
