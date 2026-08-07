// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate } from "@/lib/dates";
import { formatCents, decimalToCents, centsToNumber } from "@/lib/money";

/**
 * Restaura o que o cancelamento destrutivo de assinaturas apagou em 2026-08-07.
 *
 * O cancelamento antigo apagava as provisões futuras não pagas e desativava o
 * item. O usuário desativou as 6 assinaturas esperando só desligar o vínculo, e
 * perdeu provisões (2026-09 em diante).
 *
 * Este script restaura APENAS o que foi medido nesta sessão antes da perda —
 * nada é inventado:
 *
 *   YouTube Premium  2026-09..2028-12, R$ 53,90/mês (28 linhas — inspecionadas
 *                    integralmente ao corrigir o item duplicado)
 *   Nucel            2026-09, R$ 50,00 (única futura evidenciada; o valor de
 *                    set difere de ago, que era R$ 45,00)
 *
 * Academia Audrey e iCloud também perderam o que tivessem de 2026-09 em diante,
 * mas nenhuma medição desta sessão registrou essas linhas — recriar seria
 * chutar valor e horizonte. O caminho é recadastrar a assinatura (agora o
 * recadastro reativa e reprovisiona).
 *
 * Também reativa os 4 itens que o cancelamento desativou.
 *
 * Uso: npx tsx scripts/restaura-provisoes-canceladas.ts          (simula)
 *      npx tsx scripts/restaura-provisoes-canceladas.ts --apply  (grava)
 */

const APPLY = process.argv.includes("--apply");

const REACTIVATE_ITEMS = ["YouTube Premium", "Nucel", "Academia Audrey", "iCloud"];

function monthsRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = monthToDate(from);
  const end = monthToDate(to);
  while (d <= end) {
    out.push(monthStringFromDate(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** [item, meses, centavos por mês] — só o que foi medido. */
const RESTORE: [string, string[], number][] = [
  ["YouTube Premium", monthsRange("2026-09", "2028-12"), 5390],
  ["Nucel", ["2026-09"], 5000],
];

async function main() {
  console.log(APPLY ? "MODO: gravando (--apply)\n" : "MODO: simulação — nada será gravado\n");

  for (const name of REACTIVATE_ITEMS) {
    const item = await prisma.item.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (!item) {
      console.log(`✗ item "${name}" não existe mais`);
      continue;
    }
    console.log(`${item.active ? "•" : "→"} item "${name}": ${item.active ? "já ativo" : "REATIVAR"}`);
    if (APPLY && !item.active) await prisma.item.update({ where: { id: item.id }, data: { active: true } });
  }

  for (const [name, months, cents] of RESTORE) {
    const item = await prisma.item.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (!item) continue;
    let created = 0;
    let existed = 0;
    let fixedZero = 0;
    for (const m of months) {
      const already = await prisma.monthlyEntry.findUnique({
        where: { itemId_month: { itemId: item.id, month: monthToDate(m) } },
      });
      if (already) {
        // "Copiar mês anterior" copiou o ZERO pós-consumo de agosto: linha em
        // aberto com previsto 0,00 não é dado do usuário, é eco do consumo —
        // recebe o valor evidenciado. Qualquer outro valor existente é
        // respeitado (o usuário está restaurando à mão em paralelo).
        const cents0 = decimalToCents(String(already.plannedAmount));
        if (!already.paid && cents0 === 0 && cents > 0) {
          fixedZero++;
          if (APPLY) {
            await prisma.monthlyEntry.update({
              where: { id: already.id },
              data: { plannedAmount: centsToNumber(cents) },
            });
          }
        } else existed++;
        continue;
      }
      created++;
      if (APPLY) {
        await prisma.monthlyEntry.create({
          data: { itemId: item.id, month: monthToDate(m), plannedAmount: centsToNumber(cents) },
        });
      }
    }
    console.log(
      `→ "${name}": ${created} a criar de ${formatCents(cents)} (${months[0]}..${months[months.length - 1]}), ${fixedZero} zeros da cópia a corrigir, ${existed} respeitadas`,
    );
  }

  if (!APPLY) {
    console.log("\nSimulação. Rode com --apply para gravar.");
    return;
  }

  // Conferência pós-escrita.
  for (const [name] of RESTORE) {
    const item = await prisma.item.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (!item) continue;
    const entries = await prisma.monthlyEntry.findMany({ where: { itemId: item.id }, orderBy: { month: "asc" } });
    const total = entries.reduce((a, e) => a + decimalToCents(String(e.plannedAmount)), 0);
    console.log(
      `✓ "${name}": ${entries.length} linhas (${monthStringFromDate(entries[0].month)}..${monthStringFromDate(entries[entries.length - 1].month)}), soma ${formatCents(total)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
