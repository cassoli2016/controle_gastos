import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { cashBalance } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { decimalToCents } from "@/lib/money";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { reserveStatement, statementCheck, type StatementLine } from "@/lib/reserve-statement";
import { DEPOSIT_PREFIX, WITHDRAWAL_PREFIX } from "@/lib/reserve-flow";

export type NegativeMonth = { month: string; balanceCents: number };

/**
 * Meses cujo saldo é negativo, a partir das linhas já agrupadas por mês — o
 * "descoberto" que as caixinhas precisam cobrir.
 *
 * Usa `cashBalance`, que CONTA as transferências, e não `plannedBalance`, que
 * as ignora. O motivo é que o número do outro lado da conta — o total das
 * caixinhas — se mexe com elas: uma retirada já saiu daquele total. Medir um
 * lado com transferência e o outro sem fazia o mesmo dinheiro ser descontado
 * duas vezes da folga: ao pagar R$ 20 mil de uma conta prevista com a
 * caixinha, a reserva caía 20 mil e o descoberto continuava contando a
 * despesa inteira, como se ela seguisse em aberto.
 *
 * Vale nos dois sentidos: o depósito sai da conta corrente, então um mês que
 * fecharia no azul pode virar descoberto — e deve, porque o dinheiro só trocou
 * de bolso e o total das caixinhas já subiu.
 */
export function negativeMonths(byMonth: Map<string, EntryView[]>): NegativeMonth[] {
  const out: NegativeMonth[] = [];
  for (const [month, views] of byMonth) {
    const balanceCents = cashBalance(views);
    if (balanceCents < 0) out.push({ month, balanceCents });
  }
  return out;
}

/**
 * Meses (do corrente em diante) cujo saldo é negativo, lendo o banco. A regra
 * está em `negativeMonths`; aqui só se monta a entrada dela.
 */
export async function getNegativeMonths(): Promise<NegativeMonth[]> {
  // "Hoje" vem sempre de todayISOInSaoPaulo() (regra do projeto): usar
  // `new Date()` aqui divergiria no fuso do servidor e poderia trocar de mês
  // horas antes/depois do que o resto do app, nas primeiras horas do dia 1.
  const today = todayISOInSaoPaulo();
  const current = monthToDate(today.slice(0, 7));
  const rows = await prisma.monthlyEntry.findMany({
    where: { month: { gte: current } },
    include: { item: { include: { category: true } }, category: true },
    orderBy: { month: "asc" },
  });

  const byMonth = new Map<string, EntryView[]>();
  for (const r of rows) {
    const key = monthStringFromDate(r.month);
    const list = byMonth.get(key) ?? [];
    list.push(toEntryView(r as never));
    byMonth.set(key, list);
  }

  // A reserva do dia a dia é despesa do mês, então pesa no descoberto: um mês
  // que fecharia no zero passa a precisar de cobertura.
  const budget = await getDailyBudget();

  if (budget) {
    for (const [month, views] of byMonth) {
      byMonth.set(month, [...views, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]);
    }
  }
  return negativeMonths(byMonth); // rows vêm ordenadas por mês; Map preserva a ordem
}

export type ReserveView = { id: string; name: string; amountCents: number };

/** Caixinhas de reserva com valores em centavos (para exibição/cálculo). */
export async function getReserves(): Promise<ReserveView[]> {
  const boxes = await prisma.reserveBox.findMany({ orderBy: { name: "asc" } });
  return boxes.map((b) => ({
    id: b.id,
    name: b.name,
    amountCents: decimalToCents(String(b.amount)),
  }));
}

/** Valor por dia da reserva do dia a dia; null = ainda não configurado. */
export async function getDailyBudget(): Promise<{ perDayCents: number } | null> {
  const row = await prisma.dailyBudget.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return { perDayCents: decimalToCents(String(row.amountPerDay)) };
}

/**
 * Extrato de cada caixinha, pronto para exibição: depósitos e retiradas (que
 * são lançamentos do mês) unidos aos ajustes (que não são), com saldo corrente
 * e a checagem contra o saldo registrado.
 */
export async function getReserveStatements(): Promise<
  Record<string, { lines: StatementLine[]; check: ReturnType<typeof statementCheck> }>
> {
  const [boxes, movements, adjustments] = await Promise.all([
    prisma.reserveBox.findMany(),
    prisma.monthlyEntry.findMany({
      where: { reserveBoxId: { not: null } },
      select: {
        reserveBoxId: true,
        description: true,
        withdrawalForId: true,
        paidDate: true,
        purchaseDate: true,
        paidAmount: true,
        plannedAmount: true,
      },
    }),
    prisma.reserveAdjustment.findMany(),
  ]);

  // Nome da conta que cada retirada pagou: é o que faz o extrato ser
  // conferível. Sem isso toda linha dizia "Retirada · <caixinha>", repetindo o
  // nome da própria caixinha e escondendo a única informação útil.
  const paidNames = new Map(
    (
      await prisma.monthlyEntry.findMany({
        where: { id: { in: movements.map((m) => m.withdrawalForId).filter((x): x is string => x !== null) } },
        select: { id: true, description: true, item: { select: { name: true } } },
      })
    ).map((e) => [e.id, e.item?.name ?? e.description ?? null] as const),
  );

  const out: Record<string, { lines: StatementLine[]; check: ReturnType<typeof statementCheck> }> = {};
  for (const box of boxes) {
    const meus = movements.filter((m) => m.reserveBoxId === box.id);
    const asLine = (m: (typeof meus)[number]) => {
      const conta = m.withdrawalForId ? paidNames.get(m.withdrawalForId) : null;
      return {
        // paidDate é a data do movimento; purchaseDate cobre o registro antigo
        // que porventura não tenha baixa gravada.
        dateISO: (m.paidDate ?? m.purchaseDate ?? new Date()).toISOString().slice(0, 10),
        // O nome da caixinha é o contexto da tela inteira — repeti-lo em toda
        // linha só gasta espaço.
        description: conta
          ? `Pagamento de ${conta}`
          : m.description?.startsWith(DEPOSIT_PREFIX)
            ? "Depósito"
            : "Retirada",
        amountCents: decimalToCents(String(m.paidAmount ?? m.plannedAmount)),
      };
    };
    const lines = reserveStatement({
      deposits: meus.filter((m) => m.description?.startsWith(DEPOSIT_PREFIX)).map(asLine),
      withdrawals: meus.filter((m) => m.description?.startsWith(WITHDRAWAL_PREFIX)).map(asLine),
      adjustments: adjustments
        .filter((a) => a.boxId === box.id)
        .map((a) => ({
          dateISO: a.date.toISOString().slice(0, 10),
          reason: a.reason,
          amountCents: decimalToCents(String(a.amount)),
        })),
    });
    out[box.id] = { lines, check: statementCheck(lines, decimalToCents(String(box.amount))) };
  }
  return out;
}
