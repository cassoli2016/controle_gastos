// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";

/**
 * Ajuste único (2026-08-01): "Gás de Cozinha" é comprado a cada 2 meses, mas
 * o item foi criado com Frequência 1 (mensal) — e todo "Copiar mês anterior"
 * seguiu essa configuração, gerando um lançamento por mês de set/26 a dez/28.
 * Este script coloca o item em Frequência 2 e apaga os meses fora da cadência
 * ímpar a partir de set/26 (set, nov, jan, mar… ficam).
 *
 * Segurança: aborta se algum lançamento a apagar estiver pago — baixa é
 * histórico e não pode sumir sem decisão explícita.
 */
const ITEM_NAME = "Gás de Cozinha";
const ANCHOR = "2026-09"; // primeiro mês que fica; a cadência conta a partir daqui

/** Meses de distância entre dois "YYYY-MM". */
function monthsApart(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

async function main() {
  const item = await prisma.item.findFirst({ where: { name: ITEM_NAME, active: true } });
  if (!item) throw new Error(`Item "${ITEM_NAME}" não encontrado.`);

  const entries = await prisma.monthlyEntry.findMany({
    where: { itemId: item.id },
    orderBy: { month: "asc" },
  });
  const foraDaCadencia = entries.filter((e) => monthsApart(ANCHOR, monthStringFromDate(e.month)) % 2 !== 0);
  const pagos = foraDaCadencia.filter((e) => e.paid);
  if (pagos.length > 0) {
    throw new Error(
      `${pagos.length} lançamento(s) fora da cadência estão PAGOS (${pagos
        .map((e) => monthStringFromDate(e.month))
        .join(", ")}) — revise antes de apagar.`,
    );
  }

  console.log(`Item "${item.name}": frequência ${item.intervalMonths} → 2`);
  console.log(`Mantidos (${entries.length - foraDaCadencia.length}): ${entries
    .filter((e) => !foraDaCadencia.includes(e))
    .map((e) => monthStringFromDate(e.month))
    .join(", ")}`);
  console.log(`Apagados (${foraDaCadencia.length}): ${foraDaCadencia.map((e) => monthStringFromDate(e.month)).join(", ")}`);

  await prisma.$transaction([
    prisma.item.update({ where: { id: item.id }, data: { intervalMonths: 2 } }),
    prisma.monthlyEntry.deleteMany({ where: { id: { in: foraDaCadencia.map((e) => e.id) } } }),
  ]);
  console.log("Pronto.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix-gas-bimestral falhou:", (e as Error).message);
    process.exit(1);
  });
