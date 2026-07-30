// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * Higiene de categorias (2026-07-30):
 * 1) Unifica as duas categorias INCOME: move itens/lançamentos de "Renda"
 *    (1 item arquivado, 0 lançamentos) para "Recebimentos" e apaga "Renda".
 * 2) Paleta com matiz distinto por categoria (3 pares colidiam; a pizza do
 *    Dashboard ficava ilegível). Cores já boas são mantidas.
 * Idempotente: sem "Renda", o passo 1 não faz nada; o passo 2 só regrava cores.
 *
 * Uso: npx tsx scripts/fix-categorias.ts
 */
const PALETTE: Record<string, string> = {
  "Saúde": "#ef4444",
  "Transporte": "#f59e0b",
  "Educação": "#eab308",
  "Alimentação": "#84cc16",
  "Recebimentos": "#10b981",
  "Seguros": "#14b8a6",
  "Moradia": "#3b82f6",
  "Cartão/Compras": "#6366f1",
  "Assinaturas": "#a855f7",
  "Lazer": "#d946ef",
  "Audrey": "#ec4899",
  "Outros": "#64748b",
};

async function main() {
  const renda = await prisma.category.findFirst({ where: { name: "Renda", type: "INCOME" } });
  if (renda) {
    const receb = await prisma.category.findFirst({ where: { name: "Recebimentos", type: "INCOME" } });
    if (!receb) throw new Error('Categoria "Recebimentos" não encontrada — abortando a fusão.');
    const [items, entries] = await Promise.all([
      prisma.item.updateMany({ where: { categoryId: renda.id }, data: { categoryId: receb.id } }),
      prisma.monthlyEntry.updateMany({ where: { categoryId: renda.id }, data: { categoryId: receb.id } }),
    ]);
    await prisma.category.delete({ where: { id: renda.id } });
    console.log(`"Renda" fundida em "Recebimentos": ${items.count} item(ns), ${entries.count} lançamento(s).`);
  } else {
    console.log('Sem categoria "Renda" — fusão já feita.');
  }

  for (const [name, color] of Object.entries(PALETTE)) {
    const res = await prisma.category.updateMany({ where: { name }, data: { color } });
    if (res.count === 0) console.log(`(paleta) categoria "${name}" não existe — ignorada.`);
  }
  console.log("Paleta aplicada.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
