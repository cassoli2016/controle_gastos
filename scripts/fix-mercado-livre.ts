// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { monthStringFromDate } from "@/lib/dates";
import { addPurchaseToCard, deleteCardTransaction, type CardRef } from "@/lib/card-entry";

/**
 * Ajuste único (2026-07-31): a compra "Mercado Livre" (3× R$ 46,33 no Nubank)
 * foi lançada pela FOTO como cobrança única de R$ 138,98 na fatura de ago/26,
 * porque a legenda "nubank" substituía as dicas extraídas da imagem e as
 * parcelas se perdiam (corrigido em fix/foto-parcelas). Este script apaga a
 * cobrança única e relança como 3× de R$ 46,33 a partir de ago/26.
 */
async function main() {
  const tx = await prisma.cardTransaction.findFirst({
    where: { description: "Mercado Livre", amount: 138.98, card: { name: "Nubank" } },
    include: { card: true },
  });
  if (!tx) throw new Error("Cobrança única do Mercado Livre não encontrada — nada a fazer.");
  console.log(`Apagando ${tx.description} ${formatCents(13898)} na fatura ${monthStringFromDate(tx.month)}…`);
  const del = await deleteCardTransaction(tx.id);
  if (!del.ok) throw new Error(del.error);

  const card: CardRef = { id: tx.card.id, name: tx.card.name, closingDay: tx.card.closingDay, dueDay: tx.card.dueDay };
  const { months, firstMonthTotalCents } = await addPurchaseToCard(card, monthStringFromDate(tx.month), 4633, 3, {
    description: "Mercado Livre",
  });
  console.log(`Relançado 3x de ${formatCents(4633)} em ${months.join(", ")} (fatura ${months[0]}: ${formatCents(firstMonthTotalCents)}).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix-mercado-livre falhou:", (e as Error).message);
    process.exit(1);
  });
