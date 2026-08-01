// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { monthStringFromDate } from "@/lib/dates";
import { addPurchaseToCard, deleteCardTransaction, type CardRef } from "@/lib/card-entry";

/**
 * Ajuste único (2026-07-31, 2ª passada): a compra "Mercado Livre" no Nubank
 * (4× R$ 34,74, conforme a imagem do comprovante) foi lançada pela FOTO como
 * cobrança única de R$ 138,98 (a legenda "nubank" descartava as parcelas
 * extraídas da imagem — corrigido em fix/foto-parcelas). A 1ª passada deste
 * script relançou como 3× R$ 46,33 (inferência errada a partir do total);
 * esta versão apaga o que houver da compra e relança como 4× R$ 34,74 a
 * partir de ago/26.
 */
const DESCRIPTION = "Mercado Livre";
const START_MONTH = "2026-08";
const PER_INSTALLMENT_CENTS = 3474;
const INSTALLMENTS = 4;

async function main() {
  const existing = await prisma.cardTransaction.findMany({
    where: { description: DESCRIPTION, card: { name: "Nubank" } },
    include: { card: true },
    orderBy: { month: "asc" },
  });
  if (existing.length === 0) throw new Error("Nenhum lançamento do Mercado Livre encontrado — nada a fazer.");

  for (const tx of existing) {
    console.log(
      `Apagando ${tx.description} ${formatCents(Math.round(Number(tx.amount) * 100))} na fatura ${monthStringFromDate(tx.month)}…`,
    );
    const del = await deleteCardTransaction(tx.id);
    if (!del.ok) throw new Error(del.error);
  }

  const c = existing[0].card;
  const card: CardRef = { id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay };
  const { months, firstMonthTotalCents } = await addPurchaseToCard(card, START_MONTH, PER_INSTALLMENT_CENTS, INSTALLMENTS, {
    description: DESCRIPTION,
  });
  console.log(
    `Relançado ${INSTALLMENTS}x de ${formatCents(PER_INSTALLMENT_CENTS)} em ${months.join(", ")} (fatura ${months[0]}: ${formatCents(firstMonthTotalCents)}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix-mercado-livre falhou:", (e as Error).message);
    process.exit(1);
  });
