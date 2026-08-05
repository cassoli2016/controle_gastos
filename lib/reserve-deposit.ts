import { prisma } from "@/lib/prisma";
import { centsToNumber } from "@/lib/money";
import { depositEntryData } from "@/lib/reserve-flow";

/**
 * Grava um depósito: soma na caixinha E cria o lançamento já pago no mês da
 * data, na MESMA transação — o dinheiro está ou no mês ou na caixinha, nunca
 * nos dois.
 *
 * Compartilhado pela tela de Reservas e pelo bot: os dois precisam do par
 * indivisível, e duplicar a transação em dois lugares é como um deles acaba
 * esquecendo metade.
 */
export async function depositToReserveBox(opts: {
  boxId: string;
  amountCents: number;
  dateISO: string;
  categoryId: string;
}): Promise<{ boxName: string; newBalanceCents: number } | { error: string }> {
  const box = await prisma.reserveBox.findUnique({ where: { id: opts.boxId } });
  if (!box) return { error: "Caixinha não encontrada." };
  const amount = centsToNumber(opts.amountCents);

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.reserveBox.update({
      where: { id: opts.boxId },
      data: { amount: { increment: amount } },
    });
    await tx.monthlyEntry.create({
      data: { categoryId: opts.categoryId, ...depositEntryData(box.name, amount, opts.dateISO) },
    });
    return b;
  });
  return { boxName: box.name, newBalanceCents: Math.round(Number(updated.amount) * 100) };
}
