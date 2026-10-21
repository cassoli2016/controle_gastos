import { prisma } from "@/lib/prisma";
import { centsToNumber } from "@/lib/money";
import { depositEntryData } from "@/lib/reserve-flow";

/**
 * Grava um depósito: soma na caixinha E cria o lançamento já pago no mês da
 * data, na MESMA transação — o dinheiro está ou no mês ou na caixinha, nunca
 * nos dois.
 *
 * `alreadyMoved`: o dinheiro JÁ está na caixinha (a transferência foi feita no
 * banco e o saldo já foi atualizado à mão). O lançamento entra igual, e um
 * ajuste contrário devolve o saldo ao que era — as duas linhas se cancelam no
 * total e contam a história no extrato. É o mesmo par do "Fechar o mês" com
 * "já saiu/entrou na conta" marcado. Sem isto, quem já tinha guardado via o
 * app insistir que a sobra "ainda está na conta" (R$ 17.698,70 em out/2026).
 *
 * Compartilhado pela tela de Reservas, pelo Mês e pelo bot: os três precisam
 * do par indivisível, e duplicar a transação é como um deles acaba esquecendo
 * metade.
 */
export async function depositToReserveBox(opts: {
  boxId: string;
  amountCents: number;
  dateISO: string;
  categoryId: string;
  alreadyMoved?: boolean;
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
      data: {
        categoryId: opts.categoryId,
        reserveBoxId: opts.boxId,
        ...depositEntryData(box.name, amount, opts.dateISO),
      },
    });
    if (!opts.alreadyMoved) return b;
    const reverted = await tx.reserveBox.update({
      where: { id: opts.boxId },
      data: { amount: { decrement: amount } },
    });
    await tx.reserveAdjustment.create({
      data: {
        boxId: opts.boxId,
        date: new Date(opts.dateISO + "T00:00:00Z"),
        amount: -amount,
        reason: `Depósito de ${opts.dateISO.slice(8, 10)}/${opts.dateISO.slice(5, 7)} já refletido no saldo`,
      },
    });
    return reverted;
  });
  return { boxName: box.name, newBalanceCents: Math.round(Number(updated.amount) * 100) };
}
