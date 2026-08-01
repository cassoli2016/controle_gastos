// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents, decimalToCents } from "@/lib/money";

/**
 * Limpeza única (2026-08-01): dividendos deixaram de virar receita do mês
 * (spec 2026-08-01-dividendos-sem-receita). Apaga as receitas "Dividendos"
 * já lançadas (apontadas por Dividend.entryId), zera os ponteiros e remove a
 * categoria "Dividendos" se ficar órfã. Idempotente: rodar de novo não acha
 * nada para apagar.
 */
async function main() {
  const withEntry = await prisma.dividend.findMany({ where: { entryId: { not: null } } });
  const entryIds = withEntry.map((d) => d.entryId).filter((id): id is string => id !== null);

  const entries = await prisma.monthlyEntry.findMany({ where: { id: { in: entryIds } } });
  const totalCents = entries.reduce((acc, e) => acc + decimalToCents(String(e.plannedAmount)), 0);

  const del = await prisma.monthlyEntry.deleteMany({ where: { id: { in: entryIds } } });
  const cleared = await prisma.dividend.updateMany({
    where: { entryId: { not: null } },
    data: { entryId: null },
  });
  console.log(`Apagadas ${del.count} receitas de dividendos (${formatCents(totalCents)}); ${cleared.count} ponteiros zerados.`);

  const category = await prisma.category.findFirst({
    where: { name: "Dividendos" },
    include: { _count: { select: { entries: true, items: true } } },
  });
  if (!category) {
    console.log('Categoria "Dividendos" não existe — nada a remover.');
  } else if (category._count.entries === 0 && category._count.items === 0) {
    await prisma.category.delete({ where: { id: category.id } });
    console.log('Categoria "Dividendos" órfã removida.');
  } else {
    console.log(
      `Categoria "Dividendos" mantida (${category._count.entries} lançamentos, ${category._count.items} itens).`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix-dividendos-receitas falhou:", (e as Error).message);
    process.exit(1);
  });
