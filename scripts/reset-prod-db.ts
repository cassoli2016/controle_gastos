// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho e lib/prisma
// lê DATABASE_URL no top-level do módulo.
import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * Zera TODOS os dados do banco (lançamentos, itens, categorias, cartões e
 * caixinhas). Sem argumentos só mostra as contagens; apagar de verdade exige
 * a flag --yes:  npx tsx scripts/reset-prod-db.ts --yes
 */
const CONFIRMED = process.argv.includes("--yes");

async function main() {
  const [entries, items, categories, cards, reserves] = await Promise.all([
    prisma.monthlyEntry.count(),
    prisma.item.count(),
    prisma.category.count(),
    prisma.creditCard.count(),
    prisma.reserveBox.count(),
  ]);

  console.log("Dados atuais no banco:");
  console.log(`  Lançamentos mensais: ${entries}`);
  console.log(`  Itens (contas fixas): ${items}`);
  console.log(`  Categorias:          ${categories}`);
  console.log(`  Cartões:             ${cards}`);
  console.log(`  Caixinhas:           ${reserves}`);

  if (!CONFIRMED) {
    console.log("\nNada foi apagado (dry-run). Para zerar tudo: npx tsx scripts/reset-prod-db.ts --yes");
    return;
  }

  // Ordem respeita as FKs: entry → item → category; card e reserve independentes.
  await prisma.$transaction([
    prisma.monthlyEntry.deleteMany(),
    prisma.item.deleteMany(),
    prisma.category.deleteMany(),
    prisma.creditCard.deleteMany(),
    prisma.reserveBox.deleteMany(),
  ]);
  console.log("\n🧹 Banco zerado com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
