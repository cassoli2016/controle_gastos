// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { decimalToCents, centsToNumber, formatCents } from "@/lib/money";

/**
 * Ajuste único (2026-07-19): a primeira importação de fatura criou lançamentos
 * individuais em JULHO, mas a fatura fecha dia 05/08 e é paga em 10/08.
 * Este script: (1) cadastra closingDay=5 no cartão Nubank; (2) consolida os
 * lançamentos de cartão de julho num ÚNICO lançamento em AGOSTO
 * (description = nome do cartão), apagando os individuais.
 */
async function main() {
  const nubank = await prisma.creditCard.findFirst({
    where: { name: { contains: "nubank", mode: "insensitive" } },
  });
  if (!nubank) throw new Error("Cartão Nubank não encontrado.");

  await prisma.creditCard.update({ where: { id: nubank.id }, data: { closingDay: 5 } });
  console.log(`Cartão "${nubank.name}": dia de fechamento definido para 5.`);

  const july = monthToDate("2026-07");
  const august = monthToDate("2026-08");

  const entries = await prisma.monthlyEntry.findMany({ where: { cardId: { not: null }, month: july } });
  if (entries.length === 0) {
    console.log("Nenhum lançamento de cartão em julho — nada a consolidar.");
    return;
  }

  const totalCents = entries.reduce((acc, e) => acc + decimalToCents(String(e.plannedAmount)), 0);

  await prisma.$transaction([
    prisma.monthlyEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } }),
    prisma.monthlyEntry.create({
      data: {
        description: nubank.name,
        cardId: nubank.id,
        categoryId: entries[0].categoryId,
        month: august,
        plannedAmount: centsToNumber(totalCents),
      },
    }),
  ]);

  console.log(
    `Consolidado: ${entries.length} lançamentos de julho viraram 1 lançamento "${nubank.name}" em agosto — ${formatCents(totalCents)}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
