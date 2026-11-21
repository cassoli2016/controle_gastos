// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { getCurrentMonthLeftover, getReserves } from "@/lib/planning";
import { resolveCategoryId } from "@/lib/purchases";
import { RESERVE_CATEGORY } from "@/lib/reserve-flow";
import { depositToReserveBox } from "@/lib/reserve-deposit";

/**
 * Salário e 13º de nov/2026 foram para a caixinha como "Ajuste manual"
 * (06/11 +27.602,67, 18/11 +5.280,29, 21/11 +15.350,15; e o 13º pago em 30/10
 * +5.261,22). Ajuste não passa pela conta, então o app seguia achando que o
 * dinheiro estava parado na conta corrente — R$ 31.525,68 contados duas vezes,
 * na caixinha e no saldo do mês. A tendência das reservas mostrava
 * R$ 50.985,95 em nov/27.
 *
 * Correção: um depósito "já refletido no saldo" do que o app acha que está na
 * conta (a sobra realizada do mês). O saldo da caixinha não muda; o depósito
 * e o ajuste contrário contam a história no extrato — o mesmo par que o
 * "Fechar o mês" usou em 20/10. Os ajustes digitados à mão ficam como estão.
 *
 * Outubro já está certo: a sobra realizada de out/2026 é R$ 0,00 desde o
 * depósito de R$ 17.698,70 em 20/10.
 *
 * Idempotente: depois de gravar, a sobra realizada de novembro é zero e uma
 * segunda execução não faz nada.
 *
 *   npx tsx scripts/fix-salario-como-ajuste-2026-11.ts            # simulação
 *   npx tsx scripts/fix-salario-como-ajuste-2026-11.ts --apply    # grava
 */
const DATE = "2026-11-21";

async function main() {
  const apply = process.argv.includes("--apply");
  for (const d of ["2026-10-31", DATE]) {
    console.log(`${d.slice(0, 7)}: parado na conta ${formatCents(await getCurrentMonthLeftover(d))}`);
  }
  const leftover = await getCurrentMonthLeftover(DATE);
  if (leftover <= 0) {
    console.log("Nada a fazer: novembro já não tem dinheiro parado na conta.");
    return;
  }
  const boxes = await getReserves();
  if (boxes.length !== 1) throw new Error(`Esperava 1 caixinha, achei ${boxes.length}.`);
  const box = boxes[0];
  console.log(`Depósito já refletido de ${formatCents(leftover)} em ${box.name} (${DATE}); saldo segue ${formatCents(box.amountCents)}.`);
  if (!apply) {
    console.log("Simulação. Rode com --apply para gravar.");
    return;
  }
  const r = await depositToReserveBox({
    boxId: box.id,
    amountCents: leftover,
    dateISO: DATE,
    categoryId: await resolveCategoryId(RESERVE_CATEGORY),
    alreadyMoved: true,
  });
  if ("error" in r) throw new Error(r.error);
  console.log(`Gravado. Saldo de ${r.boxName}: ${formatCents(r.newBalanceCents)}.`);
  console.log(`Parado na conta agora: ${formatCents(await getCurrentMonthLeftover(DATE))}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
