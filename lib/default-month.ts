import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { todayISOInSaoPaulo } from "@/lib/fatura";

/**
 * Mês padrão das telas (quando não há ?month= na URL): o primeiro mês, do
 * corrente em diante, que ainda tem lançamento em aberto (paid=false).
 * Assim, quando o mês corrente já está 100% pago (ou vazio), o controle
 * "abre no próximo mês" automaticamente. Se não houver nada em aberto no
 * futuro, cai no mês corrente.
 */
export async function resolveDefaultMonth(): Promise<string> {
  // Hoje em Brasília, como o resto do app: `new Date()` é UTC e virava o mês
  // três horas antes, entre 21h e meia-noite do último dia.
  const current = todayISOInSaoPaulo().slice(0, 7);
  const firstOpen = await prisma.monthlyEntry.findFirst({
    where: { month: { gte: monthToDate(current) }, paid: false },
    orderBy: { month: "asc" },
    select: { month: true },
  });
  return firstOpen ? monthStringFromDate(firstOpen.month) : current;
}
