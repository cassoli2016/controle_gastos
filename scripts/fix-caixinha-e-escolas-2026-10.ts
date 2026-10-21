// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthStringFromDate } from "@/lib/dates";
import { decimalToCents, formatCents } from "@/lib/money";

/**
 * Dois ajustes decididos pelo usuário em 2026-10-20 (ver auditoria):
 *
 * 1. Caixinha "Cristian Cassoli", 08/10: o saldo está correto. Ficam o ajuste
 *    manual de -R$ 1.022,77 (o movimento real) e sai o par depósito + retirada
 *    do mesmo valor e dia, que se cancela — não muda saldo nem mês, só limpa o
 *    extrato e a lista de outubro.
 * 2. Escolas: cada uma vira UMA conta. Os lançamentos avulsos de 2026 e
 *    2028–2029 passam a pertencer ao item (que volta a ativo); os valores de
 *    cada mês ficam exatamente como estão.
 *
 *   npx tsx scripts/fix-caixinha-e-escolas-2026-10.ts            # simulação
 *   npx tsx scripts/fix-caixinha-e-escolas-2026-10.ts --apply    # grava
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODO: APLICAR" : "MODO: SIMULAÇÃO (use --apply para gravar)");

  // ─────────────────────────── 1. par que se cancela ───────────────────────
  console.log("\n[1] Caixinha: par depósito + retirada de 08/10");
  const box = await prisma.reserveBox.findFirst({ where: { name: "Cristian Cassoli" } });
  if (!box) throw new Error("caixinha não encontrada");
  const dia = new Date("2026-10-08T00:00:00Z");
  const [dep, ret, adj] = await Promise.all([
    prisma.monthlyEntry.findMany({ where: { reserveBoxId: box.id, description: `Depósito · ${box.name}`, paidDate: dia, paidAmount: 1022.77 } }),
    prisma.monthlyEntry.findMany({ where: { reserveBoxId: box.id, description: `Retirada · ${box.name}`, paidDate: dia, paidAmount: 1022.77, withdrawalForId: null } }),
    prisma.reserveAdjustment.findMany({ where: { boxId: box.id, date: dia, amount: -1022.77 } }),
  ]);
  console.log(`  depósito: ${dep.length} · retirada avulsa: ${ret.length} · ajuste manual -1.022,77: ${adj.length} · saldo ${formatCents(decimalToCents(String(box.amount)))}`);
  if (dep.length === 1 && ret.length === 1 && adj.length === 1) {
    console.log("  → apagar o depósito e a retirada (somam zero); o ajuste fica; saldo inalterado");
    if (APPLY) await prisma.monthlyEntry.deleteMany({ where: { id: { in: [dep[0].id, ret[0].id] } } });
  } else {
    console.log("  → situação diferente da esperada; nada a fazer");
  }

  // ─────────────────────────── 2. escolas: uma conta cada ──────────────────
  console.log("\n[2] Escolas: ligar os avulsos ao item e reativar");
  for (const name of ["Escola Benício", "Escola Heitor"]) {
    const items = await prisma.item.findMany({ where: { name: { equals: name, mode: "insensitive" } }, include: { category: true } });
    if (items.length !== 1) {
      console.log(`  ${name}: ${items.length} itens com esse nome — pulando`);
      continue;
    }
    const item = items[0];
    const itemMonths = new Set(
      (await prisma.monthlyEntry.findMany({ where: { itemId: item.id }, select: { month: true } })).map((e) => monthStringFromDate(e.month)),
    );
    const avulsos = await prisma.monthlyEntry.findMany({
      where: { itemId: null, cardId: null, description: { equals: name, mode: "insensitive" } },
      include: { category: true },
      orderBy: { month: "asc" },
    });
    const colisao = avulsos.filter((a) => itemMonths.has(monthStringFromDate(a.month)));
    const categorias = [...new Set(avulsos.map((a) => a.category?.name ?? "—"))];
    console.log(
      `  ${name}: item ${item.active ? "ativo" : "ARQUIVADO"} (${item.category.name}, dia ${item.dueDay ?? "—"}), ${itemMonths.size} meses no item; ${avulsos.length} avulsos (${categorias.join("/")}) de ${avulsos[0] ? monthStringFromDate(avulsos[0].month) : "—"} a ${avulsos.at(-1) ? monthStringFromDate(avulsos.at(-1)!.month) : "—"}; colisões de mês: ${colisao.length}`,
    );
    if (colisao.length > 0) {
      console.log("  → há mês com item E avulso; pulando para não misturar");
      continue;
    }
    const valores = [...new Set(avulsos.map((a) => String(a.plannedAmount)))];
    console.log(`  → ${avulsos.length} avulsos passam a ser do item (valores mantidos: ${valores.join(", ")}); item volta a ativo`);
    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        for (const a of avulsos) {
          await tx.monthlyEntry.update({
            where: { id: a.id },
            data: { itemId: item.id, installmentId: null, installmentSeq: null, installmentCount: null },
          });
        }
        if (!item.active) await tx.item.update({ where: { id: item.id }, data: { active: true } });
      });
    }
  }
  console.log(APPLY ? "\nAPLICADO." : "\nSimulação concluída. Nada foi gravado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
