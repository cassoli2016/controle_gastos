import { prisma } from "@/lib/prisma";
import { monthStringFromDate, monthToDate } from "@/lib/dates";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { cashBalance, realizedCashBalance } from "@/lib/calc";
import type { EntryView } from "@/lib/calc";
import { decimalToCents } from "@/lib/money";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { readInstallment } from "@/lib/fatura-match";
import { reserveStatement, statementCheck, type StatementLine } from "@/lib/reserve-statement";
import { DEPOSIT_PREFIX, WITHDRAWAL_PREFIX } from "@/lib/reserve-flow";
import { observedPerDay, withVariableSpend, type CycleSpend } from "@/lib/trend";

export type NegativeMonth = { month: string; balanceCents: number };

export type ReserveCurvePoint = {
  month: string;
  /** Saldo do próprio mês (entra e sai da conta). */
  balanceCents: number;
  /** Reservas projetadas ao FIM do mês. */
  reservesCents: number;
};

export type ReserveOutlook = {
  curve: ReserveCurvePoint[];
  /**
   * Mês do ponto mais baixo da curva; null quando ela nunca desce abaixo do
   * saldo de hoje — nesse caso não existe "pior momento" a avisar.
   */
  lowMonth: string | null;
  /** Reservas no ponto mais baixo (o saldo de hoje, quando a curva só sobe). */
  lowCents: number;
};

/**
 * Curva projetada das reservas: parte do saldo de HOJE e soma, em ordem, o
 * saldo de cada mês. O número que interessa é o ponto mais baixo — o aperto
 * máximo entre aqui e o fim do horizonte.
 *
 * Existe porque somar só os meses negativos responde a pergunta errada. Ela
 * trata cada buraco como se tivesse de ser coberto pelo saldo de hoje, e
 * joga fora a sobra dos meses bons — que é justamente o dinheiro que vai
 * cobri-los. Com três meses magros logo depois de um mês de sobra grande, a
 * régua antiga anunciava um descoberto que nunca aconteceria.
 *
 * A ORDEM é o ponto inteiro: a sobra de um mês cobre os meses SEGUINTES,
 * nunca os anteriores. Dinheiro não anda para trás, e somar tudo de uma vez
 * deixaria a sobra de 2029 "pagar" o buraco deste novembro.
 *
 * Empate no mínimo fica com o primeiro mês que o atinge: é quando o aperto
 * começa, e é disso que o usuário precisa ser avisado.
 */
export function reserveOutlook(startCents: number, byMonth: Map<string, EntryView[]>): ReserveOutlook {
  const curve: ReserveCurvePoint[] = [];
  let reservesCents = startCents;
  let lowCents = startCents;
  let lowMonth: string | null = null;
  for (const [month, views] of byMonth) {
    const balanceCents = cashBalance(views);
    reservesCents += balanceCents;
    curve.push({ month, balanceCents, reservesCents });
    if (reservesCents < lowCents) {
      lowCents = reservesCents;
      lowMonth = month;
    }
  }
  return { curve, lowMonth, lowCents };
}

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
 * Saldo LIVRE das caixinhas: o total guardado menos o que os meses no vermelho
 * (do corrente em diante) vão precisar. É a régua conservadora — trata cada
 * buraco como se tivesse de ser coberto pelo que existe hoje, sem contar com a
 * sobra dos meses bons — e por isso vive ao lado da curva projetada, não no
 * lugar dela. O usuário pediu este número para "ir segurando os custos": é o
 * teto do que pode gastar sem comprometer os meses que já estão no vermelho.
 * Negativo quando as caixinhas não cobrem nem os meses no vermelho.
 */
export function freeReserveCents(reservesTotalCents: number, negatives: NegativeMonth[]): number {
  return reservesTotalCents + negatives.reduce((a, m) => a + m.balanceCents, 0);
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
  return negativeMonths(await monthlyViewsFromToday(today));
}

/**
 * Lançamentos do mês corrente em diante, agrupados por mês e já com a linha
 * da reserva do dia a dia — que é despesa do mês e por isso pesa no saldo.
 * A ordem do Map é a dos meses, porque a consulta vem ordenada.
 */
async function monthlyViewsFromToday(today: string): Promise<Map<string, EntryView[]>> {
  const rows = await prisma.monthlyEntry.findMany({
    where: { month: { gte: monthToDate(today.slice(0, 7)) } },
    include: { item: { include: { category: true } }, category: true },
    orderBy: { month: "asc" },
  });

  const byMonth = new Map<string, EntryView[]>();
  for (const r of rows) {
    const key = monthStringFromDate(r.month);
    byMonth.set(key, [...(byMonth.get(key) ?? []), toEntryView(r as never)]);
  }

  const budget = await getDailyBudget();
  if (budget) {
    for (const [month, views] of byMonth) {
      byMonth.set(month, [...views, dailyBudgetEntryView(dailyBudgetLine(month, today, budget.perDayCents))]);
    }
  }
  return byMonth;
}

/** Curva projetada das reservas lendo o banco. A regra está em `reserveOutlook`. */
export async function getReserveOutlook(): Promise<ReserveOutlook> {
  const today = todayISOInSaoPaulo();
  const reservas = await getReserves();
  return reserveOutlook(
    reservas.reduce((a, r) => a + r.amountCents, 0),
    await monthlyViewsFromToday(today),
  );
}

export type ObservedSpend = { perDayCents: number; cycles: CycleSpend[] };

/**
 * Gasto variável OBSERVADO: o à vista (não parcelado) que passou no cartão nos
 * três últimos ciclos fechados — consolidado já pago, ou competência anterior
 * à corrente. Ciclo aberto fica de fora: a fatura ainda cresce.
 * null enquanto não houver ciclo fechado nenhum.
 */
export async function getObservedVariableSpend(today: string = todayISOInSaoPaulo()): Promise<ObservedSpend | null> {
  const cur = today.slice(0, 7);
  const consolidados = await prisma.monthlyEntry.findMany({
    where: { cardId: { not: null }, purchaseDate: null, OR: [{ paid: true }, { month: { lt: monthToDate(cur) } }] },
    select: { month: true },
  });
  const closed = [...new Set(consolidados.map((c) => monthStringFromDate(c.month)))].sort().slice(-3);
  if (closed.length === 0) return null;

  const txs = await prisma.cardTransaction.findMany({
    where: { month: { in: closed.map(monthToDate) } },
    select: { month: true, description: true, bankDescription: true, amount: true, installmentSeq: true, installmentCount: true },
  });
  const vista = new Map<string, number>(closed.map((m) => [m, 0]));
  for (const t of txs) {
    const cents = decimalToCents(String(t.amount));
    if (cents <= 0) continue; // estorno e pagamento não são gasto
    const parcela = readInstallment({
      description: t.bankDescription ?? t.description,
      installmentSeq: t.installmentSeq,
      installmentCount: t.installmentCount,
    });
    if (parcela) continue; // parcela já está provisionada nos meses futuros
    const k = monthStringFromDate(t.month);
    vista.set(k, (vista.get(k) ?? 0) + cents);
  }
  const cycles: CycleSpend[] = [...vista].map(([monthISO, vistaCents]) => ({ monthISO, vistaCents }));
  const perDayCents = observedPerDay(cycles);
  return perDayCents === null ? null : { perDayCents, cycles };
}

export type ReserveOutlooks = {
  /** Com a reserva do dia a dia como configurada: o plano. */
  plan: ReserveOutlook;
  /** Com o gasto variável observado nos últimos ciclos; null sem ciclo fechado. */
  trend: (ObservedSpend & { outlook: ReserveOutlook }) | null;
  /** Total das caixinhas hoje — ponto de partida das duas curvas. */
  startCents: number;
};

/** As duas curvas, plano e tendência, lendo o banco UMA vez. */
export async function getReserveOutlooks(): Promise<ReserveOutlooks> {
  const today = todayISOInSaoPaulo();
  const [reservas, byMonth, observed] = await Promise.all([
    getReserves(),
    monthlyViewsFromToday(today),
    getObservedVariableSpend(today),
  ]);
  const startCents = reservas.reduce((a, r) => a + r.amountCents, 0);
  const plan = reserveOutlook(startCents, byMonth);
  const trend = observed
    ? { ...observed, outlook: reserveOutlook(startCents, withVariableSpend(byMonth, today.slice(0, 7), today, observed.perDayCents)) }
    : null;
  return { plan, trend, startCents };
}

/**
 * Quanto do mês corrente ainda dá para guardar: o que entrou menos o que saiu,
 * só do que já foi baixado, descontando o que já foi para as caixinhas. É o
 * dinheiro parado na conta que a curva das reservas ainda não contou como
 * guardado — ver `realizedCashBalance`.
 */
export async function getCurrentMonthLeftover(today: string = todayISOInSaoPaulo()): Promise<number> {
  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthToDate(today.slice(0, 7)) },
    include: { item: { include: { category: true } }, category: true },
  });
  return realizedCashBalance(rows.map((r) => toEntryView(r as never)));
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
