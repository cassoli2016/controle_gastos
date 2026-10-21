// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { centsToNumber, formatCents } from "@/lib/money";
import { toEntryView } from "@/lib/entries";
import { monthCloseState, closeDateFor } from "@/lib/month-close";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { resolveCategoryId } from "@/lib/purchases";
import {
  RESERVE_CATEGORY,
  RESERVE_WITHDRAWAL_CATEGORY,
  depositEntryData,
  withdrawalEntryData,
  lastUsedReserveId,
  DEPOSIT_PREFIX,
} from "@/lib/reserve-flow";

/**
 * Fecha os meses PASSADOS que estão todos baixados mas ainda têm resíduo: o
 * mesmo que o botão "Fechar o mês" faz com a opção "o dinheiro já saiu (ou
 * entrou) na conta de verdade" marcada — o par lançamento + ajuste entra no
 * extrato da caixinha e o saldo dela continua o mesmo.
 *
 *   npx tsx scripts/fecha-meses-passados.ts            # simulação
 *   npx tsx scripts/fecha-meses-passados.ts --apply    # grava
 *
 * O resíduo é recalculado na hora (monthCloseState), nunca aceito de fora.
 * Mês com conta em aberto é reportado e pulado. Rodar de novo não faz nada.
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODO: APLICAR" : "MODO: SIMULAÇÃO (use --apply para gravar)");
  const today = todayISOInSaoPaulo();
  const current = today.slice(0, 7);

  const boxes = await prisma.reserveBox.findMany({ orderBy: { name: "asc" } });
  const recent = await prisma.monthlyEntry.findMany({
    where: { description: { startsWith: DEPOSIT_PREFIX } },
    orderBy: { paidDate: "desc" },
    select: { description: true },
    take: 20,
  });
  const boxId = lastUsedReserveId(recent.map((d) => d.description ?? ""), boxes);
  const box = boxes.find((b) => b.id === boxId);
  if (!box) throw new Error("nenhuma caixinha para fechar o mês");
  console.log(`caixinha do fechamento: ${box.name} (saldo ${formatCents(Math.round(Number(box.amount) * 100))})`);

  const all = await prisma.monthlyEntry.findMany({ select: { month: true }, distinct: ["month"], orderBy: { month: "asc" } });
  const months = [...new Set(all.map((r) => monthStringFromDate(r.month)))].filter((m) => m < current);

  for (const month of months) {
    const monthDate = monthToDate(month);
    const rows = await prisma.monthlyEntry.findMany({
      where: { month: monthDate },
      include: { item: { include: { category: true } }, category: true },
    });
    const state = monthCloseState(rows.map((r) => toEntryView(r as never)));
    if (rows.length === 0) continue;
    if (state.openCount > 0) {
      console.log(`${month}: ${state.openCount} conta(s) em aberto — não fecha`);
      continue;
    }
    if (state.residualCents === 0) {
      console.log(`${month}: já fecha em zero`);
      continue;
    }
    const amountCents = Math.abs(state.residualCents);
    const amount = centsToNumber(amountCents);
    const dateISO = closeDateFor(month, today);
    const reason = `Fechamento de ${month} já refletido no saldo`;
    const verbo = state.direction === "deposit" ? "sobrou → registra depósito" : "faltou → registra retirada";
    console.log(`${month}: resíduo ${formatCents(state.residualCents)} ${verbo} de ${formatCents(amountCents)} em ${dateISO}, saldo da caixinha inalterado`);
    if (!APPLY) continue;

    if (state.direction === "deposit") {
      const categoryId = await resolveCategoryId(RESERVE_CATEGORY);
      await prisma.$transaction(async (tx) => {
        await tx.reserveBox.update({ where: { id: box.id }, data: { amount: { increment: amount } } });
        await tx.monthlyEntry.create({
          data: { categoryId, reserveBoxId: box.id, ...depositEntryData(box.name, amount, dateISO), month: monthDate },
        });
        await tx.reserveBox.update({ where: { id: box.id }, data: { amount: { decrement: amount } } });
        await tx.reserveAdjustment.create({
          data: { boxId: box.id, date: new Date(dateISO + "T00:00:00Z"), amount: -amount, reason },
        });
      });
    } else {
      const categoryId = await resolveCategoryId(RESERVE_WITHDRAWAL_CATEGORY);
      const ok = await prisma.$transaction(async (tx) => {
        const { count } = await tx.reserveBox.updateMany({
          where: { id: box.id, amount: { gte: amount } },
          data: { amount: { decrement: amount } },
        });
        if (count === 0) return false;
        await tx.monthlyEntry.create({
          data: { categoryId, reserveBoxId: box.id, ...withdrawalEntryData(box.name, amount, monthDate, dateISO) },
        });
        await tx.reserveBox.update({ where: { id: box.id }, data: { amount: { increment: amount } } });
        await tx.reserveAdjustment.create({
          data: { boxId: box.id, date: new Date(dateISO + "T00:00:00Z"), amount, reason },
        });
        return true;
      });
      if (!ok) console.log(`  ✗ ${month}: saldo insuficiente na caixinha para registrar a retirada`);
    }
    console.log(`  ✓ ${month} fechado`);
  }
  console.log(APPLY ? "\nAPLICADO." : "\nSimulação concluída. Nada foi gravado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
