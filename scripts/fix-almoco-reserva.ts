// Deve ser a PRIMEIRA linha: `tsx` não carrega o .env sozinho.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { decimalToCents, formatCents } from "@/lib/money";

/**
 * Ajuste único (2026-07-26): a reserva do dia a dia virou despesa do mês, e o
 * "Almoço" — recorrência semanal de R$ 50, ~R$ 1.050/mês — passou a contar o
 * mesmo dinheiro duas vezes, porque almoço é justamente gasto de dia a dia.
 *
 * Decisão do usuário: o Almoço sai dos lançamentos e a reserva passa a cobri-lo,
 * com o valor por dia subindo de R$ 100 para R$ 135 (os ~R$ 34/dia do almoço
 * somados aos R$ 100 que já existiam).
 *
 * Este script: (1) apaga as ocorrências de Almoço EM ABERTO; (2) sobe o valor
 * por dia da reserva. As ocorrências JÁ PAGAS ficam como histórico do que
 * realmente saiu do bolso — mesma regra que o app usa ao encerrar recorrência
 * e ao cancelar assinatura de cartão.
 *
 * Idempotente: rodar de novo não apaga nada (não sobra Almoço em aberto) e
 * reescreve o mesmo valor por dia.
 *
 * Uso: npx tsx scripts/fix-almoco-reserva.ts
 */

/** Valor por dia da reserva depois de absorver o almoço. */
const NOVO_VALOR_POR_DIA = 135;

async function main() {
  // (1) Confere que a descrição é única antes de apagar por ela — apagar por
  // padrão de texto sem checar o que ele casa é como se apaga demais.
  const candidatos = await prisma.monthlyEntry.findMany({
    where: { description: { contains: "almo", mode: "insensitive" } },
    select: { description: true },
    distinct: ["description"],
  });
  if (candidatos.length === 0) {
    console.log("(1) nenhum lançamento de almoço encontrado — nada a fazer.");
  } else if (candidatos.length > 1) {
    throw new Error(
      `(1) "almo" casa com ${candidatos.length} descrições distintas (${candidatos
        .map((c) => `"${c.description}"`)
        .join(", ")}) — abortado sem apagar nada.`,
    );
  } else {
    const descricao = candidatos[0].description!;
    const abertos = await prisma.monthlyEntry.findMany({
      where: { description: descricao, paid: false },
      select: { id: true, plannedAmount: true },
    });
    const pagos = await prisma.monthlyEntry.count({ where: { description: descricao, paid: true } });

    if (abertos.length === 0) {
      console.log(`(1) "${descricao}": nenhuma ocorrência em aberto — nada a apagar (${pagos} paga(s) preservada(s)).`);
    } else {
      const total = abertos.reduce((acc, e) => acc + decimalToCents(String(e.plannedAmount)), 0);
      const { count } = await prisma.monthlyEntry.deleteMany({ where: { id: { in: abertos.map((e) => e.id) } } });
      console.log(
        `(1) "${descricao}": ${count} ocorrência(s) em aberto removida(s) — ${formatCents(total)}.` +
          ` ${pagos} paga(s) preservada(s) como histórico.`,
      );
    }
  }

  // (2) Sobe o valor por dia da reserva, que agora cobre o almoço.
  const antes = await prisma.dailyBudget.findUnique({ where: { id: "default" } });
  await prisma.dailyBudget.upsert({
    where: { id: "default" },
    create: { id: "default", amountPerDay: NOVO_VALOR_POR_DIA },
    update: { amountPerDay: NOVO_VALOR_POR_DIA },
  });
  console.log(
    `(2) reserva do dia a dia: ${antes ? `R$ ${antes.amountPerDay}` : "(não configurada)"} → R$ ${NOVO_VALOR_POR_DIA} por dia.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
