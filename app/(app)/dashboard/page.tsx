import Link from "next/link";
import type { ReactNode } from "react";
import { upcomingRenewals, MONTH_NAMES } from "@/lib/renewals";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { calcPortfolio, formatPct } from "@/lib/investments";
import { TrendingUp, CalendarX2, PiggyBank, BellRing, CreditCard as CreditCardIcon, Target, AlarmClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  getNegativeMonths,
  getReserves,
  getDailyBudget,
  getReserveOutlooks,
  getCurrentMonthLeftover,
  freeReserveCents,
} from "@/lib/planning";
import { curveSummary, cyclesLabel, trendSentence } from "@/lib/trend";
import { shortMonthLabel } from "@/lib/matrix";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { Button } from "@/components/ui/button";
import { monthToDate, formatCompetencia, shortCompetencia, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, monthSplit, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents, sumCents, decimalToCents } from "@/lib/money";
import { upcomingCardCommitments } from "@/lib/card-entry";
import { budgetLines, budgetTone } from "@/lib/budget";
import { patrimonyProjection, withHistory } from "@/lib/patrimony";
import { getPatrimonySnapshots } from "@/lib/patrimony-snapshot";
import { SnapshotButton } from "./SnapshotButton";
import { seriesGrowth } from "@/lib/chart-scale";
import { dueSoon } from "@/lib/due-soon";
import { cardCycleStatus } from "@/lib/card-estimate";
import { horizonCells, horizonHeadline } from "@/lib/horizon";
import { cn } from "@/lib/utils";
import { MonthStatCards } from "@/components/MonthStatCards";
import { MonthBalanceCard } from "@/components/MonthBalanceCard";
import { MonthNav } from "@/components/MonthNav";
import { Money } from "@/components/Money";
import { Horizon, type HorizonSentence } from "@/components/Horizon";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { MonthlyBalance, type MonthlyBalancePoint } from "@/components/charts/MonthlyBalance";
import { PatrimonyChart } from "@/components/charts/PatrimonyChart";
import { RankingBars } from "@/components/charts/RankingBars";
import { installmentMonths } from "@/lib/installments";
import { monthStringFromDate } from "@/lib/dates";

/**
 * Uma banda do Dashboard: título pequeno à esquerda, a pista do que ela cobre
 * à direita. A ordem das bandas é a ordem de leitura: agora, o que vem,
 * análise.
 */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = sanitizeMonth(qMonth) ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } }, category: true },
  });
  const realViews = rows.map((r) => toEntryView(r as never));
  // O que ainda falta pagar e está perto (ou passou) do vencimento. Usa o mês
  // EXIBIDO: em mês futuro a lista sai vazia por construção, e em mês passado
  // sobram os atrasos — que é o que interessa olhar lá atrás.
  const vencendo = dueSoon(
    rows.map((r) => ({
      entryId: r.id,
      itemName: r.item?.name ?? r.description ?? "—",
      categoryType: (r.item?.category ?? r.category)?.type ?? "EXPENSE",
      plannedCents: decimalToCents(String(r.plannedAmount)),
      paid: r.paid,
      // Avulso usa a data do lançamento como vencimento (mesma regra do Mês).
      dueDay: r.item?.dueDay ?? (r.purchaseDate ? r.purchaseDate.getUTCDate() : null),
      readOnlyHint: null,
    })),
    month,
    todayISOInSaoPaulo(),
    7,
  );

  // Planejamento: meses futuros no vermelho × total guardado nas caixinhas.
  // categories não depende de budget (só pieData depende) — entra no mesmo
  // Promise.all para não rodar em série à toa.
  const [negativeMonths, outlooks, reserves, investAssets, renewalItems, budget, categories, activeCards, currentLeftoverCents] =
    await Promise.all([
      getNegativeMonths(),
      getReserveOutlooks(),
      getReserves(),
      prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } }),
      prisma.item.findMany({ where: { active: true, renewalMonth: { not: null } }, select: { name: true, renewalMonth: true } }),
      getDailyBudget(),
      prisma.category.findMany(),
      prisma.creditCard.findMany({ where: { active: true }, select: { id: true, name: true, monthlyEstimate: true } }),
      getCurrentMonthLeftover(),
    ]);
  const outlook = outlooks.plan;
  // Tendência em 12 meses: a mesma curva com o gasto variável observado nos
  // últimos ciclos de cartão. A frase vive ao lado da do plano, nunca no lugar.
  const trend = outlooks.trend
    ? {
        perDayCents: outlooks.trend.perDayCents,
        label: cyclesLabel(outlooks.trend.cycles),
        sentence: trendSentence(curveSummary(outlooks.trend.outlook.curve, 12), outlooks.startCents),
      }
    : null;
  const renewals = upcomingRenewals(
    renewalItems.map((i) => ({ name: i.name, renewalMonth: i.renewalMonth! })),
    Number(todayISOInSaoPaulo().slice(5, 7)),
  );
  const portfolio = calcPortfolio(
    investAssets.map((a) => ({
      quantity: a.quantity,
      avgPriceCents: Number(a.avgPrice) * 100,
      lastPriceCents: a.lastPrice !== null ? Math.round(Number(a.lastPrice) * 100) : null,
    })),
  );
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo
  const reservesTotalCents = sumCents(reserves.map((r) => r.amountCents));
  // O que sobra das caixinhas depois de cobrir todos os meses no vermelho —
  // o teto para segurar os custos.
  const freeCents = freeReserveCents(reservesTotalCents, negativeMonths);

  // A reserva do dia a dia é despesa derivada do calendário: entra em views
  // antes dos totais, da pizza e do ranking, para os três somarem o mesmo. Mês
  // sem nenhum lançamento real não ganha número fabricado — mesma regra da
  // tela Mês (guarda `isEmpty`): sem isso, um mês futuro totalmente vazio
  // aparecia com "despesa" só da reserva, e a pizza desenhava uma fatia de
  // valor zero em vez do estado "Sem despesas neste mês".
  const today = todayISOInSaoPaulo();
  const budgetLine = budget && realViews.length > 0 ? dailyBudgetLine(month, today, budget.perDayCents) : null;
  const views = budgetLine ? [...realViews, dailyBudgetEntryView(budgetLine)] : realViews;

  // Cor por ID: categorias homônimas não disputam a mesma cor/fatia (a linha
  // derivada da reserva usa id sintético e cai no cinza de fallback).
  const catColor = new Map(categories.map((c) => [c.id, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({
    categoryName: x.categoryName,
    value: x.cents,
    color: catColor.get(x.categoryId) ?? "#64748b",
  }));
  const ranking = expenseRanking(views).slice(0, 10);
  const hasExpenses = ranking.length > 0;

  // Saldo mensal: receitas − despesas previstas dos próximos 12 meses
  // (uma query para o intervalo inteiro; agrupamento por mês em JS).
  const chartMonths = installmentMonths(month, 12);
  const rangeRows = await prisma.monthlyEntry.findMany({
    where: { month: { in: chartMonths.map(monthToDate) } },
    include: { item: { include: { category: true } }, category: true },
  });
  const viewsByMonth = new Map<string, ReturnType<typeof toEntryView>[]>();
  for (const r of rangeRows) {
    const key = monthStringFromDate(r.month);
    const list = viewsByMonth.get(key) ?? [];
    list.push(toEntryView(r as never));
    viewsByMonth.set(key, list);
  }
  // Cada mês do gráfico carrega a sua reserva: mês cheio à frente, decaindo
  // no corrente, zero atrás. Mesma regra da tela Mês: mês sem nenhum
  // lançamento real fica de fora — senão o gráfico desenharia saldo
  // negativo fabricado para meses futuros sem lançamento nenhum.
  // Consolidado de cartão já lançado, por mês e cartão: base da provisão de
  // compras futuras (a fatura de um mês distante só tem as parcelas conhecidas).
  const bookedByMonthCard = new Map<string, Record<string, number>>();
  for (const r of rangeRows) {
    if (r.cardId === null || r.purchaseDate !== null) continue;
    const key = monthStringFromDate(r.month);
    const bucket = bookedByMonthCard.get(key) ?? {};
    bucket[r.cardId] = (bucket[r.cardId] ?? 0) + decimalToCents(String(r.plannedAmount));
    bookedByMonthCard.set(key, bucket);
  }
  const estimateCards = activeCards.map((c) => ({
    id: c.id,
    name: c.name,
    estimateCents: c.monthlyEstimate === null ? null : decimalToCents(String(c.monthlyEstimate)),
  }));

  // Próximo ciclo de cada cartão contra o teto: é a fatura que ainda dá para
  // mudar. Reusa o consolidado por competência já calculado acima.
  const nextCycleMonth = chartMonths[1];
  const cycles = cardCycleStatus(estimateCards, month, bookedByMonthCard.get(nextCycleMonth) ?? {});

  const monthlyViews = chartMonths.map((m) => {
    const base = viewsByMonth.get(m) ?? [];
    return {
      month: shortCompetencia(monthToDate(m)),
      views:
        base.length === 0
          ? base
          : budget
            ? [...base, dailyBudgetEntryView(dailyBudgetLine(m, today, budget.perDayCents))]
            : base,
    };
  });
  // Os mesmos meses com o gasto variável OBSERVADO no lugar da reserva do dia
  // a dia, do mês seguinte em diante (lib/trend.ts). O mês corrente fica igual.
  const currentMonth = today.slice(0, 7);
  const monthlyViewsTrend =
    trend === null
      ? null
      : chartMonths.map((m) => {
          const base = viewsByMonth.get(m) ?? [];
          const perDay = m > currentMonth ? trend.perDayCents : budget?.perDayCents ?? null;
          return {
            month: shortCompetencia(monthToDate(m)),
            views:
              base.length === 0 || perDay === null
                ? base
                : [...base, dailyBudgetEntryView(dailyBudgetLine(m, today, perDay))],
          };
        });
  const balanceData: MonthlyBalancePoint[] = monthlyViews.map(({ month: m, views: v }) => ({
    month: m,
    incomeCents: plannedIncome(v),
    expenseCents: plannedExpense(v),
    balanceCents: plannedBalance(v),
    // Só o mês corrente (e os passados) têm parte realizada; nos futuros as
    // duas metades seriam "zero" e "tudo", que não explica nada.
    ...monthSplit(v),
  }));

  // O Horizonte lê os mesmos 12 saldos do gráfico: uma fonte, duas formas. No
  // mês corrente entra só o que AINDA falta acontecer — o mesmo número que
  // "Meses no vermelho" usa. O saldo do mês inteiro (que já aconteceu em boa
  // parte) esmagava os outros onze meses na escala e não dizia nada do futuro.
  const horizon = horizonCells(
    chartMonths.map((m, i) => ({
      month: m,
      balanceCents: m === currentMonth ? (balanceData[i].toComeCents ?? balanceData[i].balanceCents) : balanceData[i].balanceCents,
    })),
    currentMonth,
  );
  // O que importa não é somar os buracos, é saber até onde a curva desce. A
  // sobra de um mês cobre os SEGUINTES, então um mês de superávit antes de
  // três magros muda tudo — a régua antiga anunciava um descoberto que nunca
  // aconteceria.
  const planLine: HorizonSentence =
    outlook.lowMonth === null
      ? { label: planLabel(budget), tone: "good", sentence: "Daqui para a frente as reservas só crescem: nenhum mês derruba o saldo de hoje." }
      : outlook.lowCents >= 0
        ? {
            label: planLabel(budget),
            tone: "good",
            sentence: `No mês mais apertado, ${shortMonthLabel(outlook.lowMonth)}, ainda sobram ${formatCents(outlook.lowCents)} nas caixinhas.`,
          }
        : {
            label: planLabel(budget),
            tone: "warn",
            sentence: `As caixinhas não chegam até o fim: em ${shortMonthLabel(outlook.lowMonth)} faltam ${formatCents(-outlook.lowCents)}.`,
          };
  // A segunda curva, com o gasto à vista medido nas últimas faturas fechadas.
  // Ela não substitui o plano: diz o que acontece se o ritmo atual continuar.
  const trendLine: HorizonSentence | null = trend
    ? {
        label: `Tendência · ${formatCents(trend.perDayCents)} por dia, média de ${trend.label}`,
        tone: trend.sentence.includes("chegam") ? "good" : "warn",
        sentence: trend.sentence,
      }
    : null;

  // Patrimônio projetado: caixinhas + carteira hoje, somando o saldo de CAIXA
  // de cada mês — não o saldo do gráfico acima, que ignora as transferências.
  // O ponto de partida já contém o dinheiro das caixinhas; usar o saldo do mês
  // contaria um depósito duas vezes. Estimativa — investimentos flutuam.
  const patrimonyData = patrimonyProjection(reservesTotalCents + portfolio.valueCents, monthlyViews);
  const patrimonyGrowth = seriesGrowth(patrimonyData.map((p) => p.totalCents));
  const patrimonyTrend = monthlyViewsTrend
    ? patrimonyProjection(reservesTotalCents + portfolio.valueCents, monthlyViewsTrend)
    : null;
  const patrimonyPoints = patrimonyData.map((p, i) => ({
    ...p,
    ...(patrimonyTrend ? { trendCents: patrimonyTrend[i].totalCents } : {}),
  }));
  // O que aconteceu de verdade: as fotos mensais dos 12 meses anteriores ao
  // exibido (e a do mês corrente, se já existe), ao lado da projeção.
  const historyFrom = (() => {
    const d = monthToDate(month);
    d.setUTCMonth(d.getUTCMonth() - 12);
    return monthStringFromDate(d);
  })();
  const snapshots = await getPatrimonySnapshots(historyFrom, chartMonths[chartMonths.length - 1]);
  const chartPoints = withHistory(
    snapshots.map((s) => ({ month: shortCompetencia(monthToDate(s.month)), totalCents: s.totalCents })),
    patrimonyPoints,
  );
  const currentSnapshot = snapshots.find((s) => s.month === currentMonth) ?? null;

  // Orçamento do mês: planejado da categoria vs meta (estouro aparece antes).
  const monthBudgets = budgetLines(
    views,
    categories
      .filter((c) => c.type === "EXPENSE")
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        budgetCents: c.budgetAmount === null ? null : decimalToCents(String(c.budgetAmount)),
        budgetIsFloor: c.budgetIsFloor,
      })),
  );

  // Compras de cartão já roteadas para as faturas dos 3 meses seguintes:
  // reaproveita rangeRows (12 meses já buscados para o gráfico). Visibilidade
  // apenas — o gasto conta no mês em que a fatura vence.
  const nextThree = new Set(chartMonths.slice(1, 4));
  const upcomingFaturas = upcomingCardCommitments(
    rangeRows
      .filter((r) => r.cardId !== null && nextThree.has(monthStringFromDate(r.month)))
      .map((r) => ({ month: monthStringFromDate(r.month), plannedCents: decimalToCents(String(r.plannedAmount)) })),
  );

  const rose = "text-rose-600 dark:text-rose-400";
  const emerald = "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-sm font-medium text-muted-foreground">Dashboard</h1>
        <MonthNav month={month} basePath="/dashboard" />
      </div>

      <Horizon
        cells={horizon}
        headline={horizonHeadline(horizon)}
        plan={planLine}
        trend={trendLine}
        freeCents={negativeMonths.length > 0 ? freeCents : null}
      />

      <Section title="Agora" hint={formatCompetencia(monthDate)}>
        {vencendo.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlarmClock className="size-4 text-amber-600 dark:text-amber-400" />
                  Vence em breve
                </span>
                <Money cents={vencendo.reduce((a, r) => a + r.cents, 0)} className="text-sm font-semibold" />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <ul className="divide-y border-t">
                {vencendo.slice(0, 6).map((r) => (
                  <li key={r.entryId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm md:px-6">
                    <span className="min-w-0 truncate">{r.itemName}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={cn("text-xs tabular-nums", r.overdue ? cn("font-medium", rose) : "text-muted-foreground")}>
                        {r.overdue
                          ? "atrasada"
                          : r.daysLeft === 0
                            ? "vence hoje"
                            : r.daysLeft === 1
                              ? "amanhã"
                              : `em ${r.daysLeft} dias`}
                      </span>
                      <Money cents={r.cents} />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 border-t px-4 py-2 md:px-6">
                <span className="text-xs text-muted-foreground">
                  {vencendo.length > 6 ? `e mais ${vencendo.length - 6} nos próximos dias` : " "}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/mes?month=${month}`}>Pagar no Mês</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} />

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          <MonthBalanceCard views={views} />

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Cartões</CardTitle>
              <CreditCardIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-4">
              {cycles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cartão com teto mensal definido.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Fatura em formação, {formatCompetencia(monthToDate(nextCycleMonth))}, contra o teto de cada cartão.
                  </p>
                  {cycles.map((c) => (
                    <div key={c.cardId} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="tabular-nums">
                          <Money cents={c.bookedCents} />
                          <span className="text-muted-foreground">
                            {" "}de <Money cents={c.limitCents} />
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            c.pct >= 100 ? "bg-rose-500" : c.pct >= 80 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${Math.min(100, c.pct)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.remainingCents === 0
                          ? `Passou do teto em ${formatCents(c.bookedCents - c.limitCents)}, ${c.pct}% usado`
                          : `Restam ${formatCents(c.remainingCents)} até o teto, ${c.pct}% usado`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {upcomingFaturas.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Próximas faturas, todos os cartões</p>
                  <ul className="mt-1.5 grid grid-cols-3 gap-2">
                    {upcomingFaturas.map((f) => (
                      <li key={f.month}>
                        <div className="text-xs text-muted-foreground">{shortMonthLabel(f.month)}</div>
                        <Money cents={f.totalCents} className="text-sm font-medium" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-auto">
                <Button asChild variant="outline" size="sm">
                  <Link href="/cartoes">Ver cartões</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="O que vem" hint="caixinhas, meses no vermelho, renovações e carteira">
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Reservas</CardTitle>
              <PiggyBank className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              <div>
                <Money cents={reservesTotalCents} tabular={false} className={cn("text-2xl font-semibold tracking-tight", emerald)} />
                <p className="text-xs text-muted-foreground">
                  {reserves.length === 0
                    ? "Nenhuma caixinha ainda"
                    : `Guardado em ${reserves.length} ${reserves.length === 1 ? "caixinha" : "caixinhas"}`}
                </p>
                {/* O dinheiro que já sobrou no mês e ainda está na conta: a curva
                    já o conta (é o saldo do mês corrente), mas quem olha só o
                    total das caixinhas não o vê. */}
                {currentLeftoverCents > 0 && (
                  <p className="text-xs text-muted-foreground">
                    + {formatCents(currentLeftoverCents)} na conta, sobra de {formatCompetencia(monthToDate(currentMonth))} ainda não guardada
                  </p>
                )}
              </div>
              {/* Saldo livre: guardado menos os meses no vermelho. É a régua
                  conservadora, pedida pelo usuário para segurar os custos — cada
                  buraco coberto pelo que existe hoje, sem contar com a sobra dos
                  meses bons. O Horizonte faz a conta otimista; as duas convivem. */}
              {negativeMonths.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span>guardado</span>
                    <Money cents={reservesTotalCents} />
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span>meses no vermelho, {negativeMonths.length}</span>
                    <Money cents={uncoveredCents} />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-1">
                    <span className="text-sm font-medium">Saldo livre</span>
                    <Money cents={freeCents} className={cn("text-lg font-semibold", freeCents < 0 ? rose : emerald)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {freeCents >= 0
                      ? "O que sobra das caixinhas depois de cobrir todos os meses no vermelho. É o seu teto para segurar os custos."
                      : "As caixinhas não cobrem todos os meses no vermelho: é o que falta."}
                  </p>
                </div>
              )}
              <div className="mt-auto">
                <Button asChild variant="outline" size="sm">
                  <Link href="/reservas">Gerenciar caixinhas</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Meses no vermelho</CardTitle>
              <CalendarX2 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              {negativeMonths.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum mês com saldo previsto negativo.</p>
              ) : (
                <>
                  <div>
                    <Money cents={uncoveredCents} tabular={false} className={cn("text-2xl font-semibold tracking-tight", rose)} />
                    <p className="text-xs text-muted-foreground">
                      Soma dos saldos negativos de {negativeMonths.length} {negativeMonths.length === 1 ? "mês" : "meses"}, do atual em diante
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {negativeMonths.map((m) => (
                      <li key={m.month} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/mes?month=${m.month}`} className="text-muted-foreground hover:text-foreground">
                          {formatCompetencia(monthToDate(m.month))}
                        </Link>
                        <Money cents={m.balanceCents} className={rose} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="mt-auto border-t pt-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <BellRing className="size-3.5" aria-hidden />
                  Renovações
                </div>
                {renewals.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Nenhuma nos próximos 3 meses.
                    {renewalItems.length === 0 && (
                      <>
                        {" "}
                        <Link href="/itens" className="underline underline-offset-2 hover:text-foreground">
                          Configure o mês de renovação nos itens.
                        </Link>
                      </>
                    )}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {renewals.map((r) => (
                      <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{r.name}</span>
                        <span className={r.monthsAway === 0 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                          {r.monthsAway === 0 ? "este mês" : MONTH_NAMES[r.renewalMonth - 1]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Investimentos</CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              <div>
                <Money cents={portfolio.valueCents} tabular={false} className="text-2xl font-semibold tracking-tight" />
                <p className="text-xs text-muted-foreground">
                  {investAssets.length === 0
                    ? "Nenhuma posição ainda"
                    : `${investAssets.length} ativos · investido ${formatCents(portfolio.costCents)}`}
                </p>
                {investAssets.length > 0 && (
                  <p className={cn("text-xs font-medium", portfolio.resultCents < 0 ? rose : emerald)}>
                    resultado {formatCents(portfolio.resultCents)}, {formatPct(portfolio.resultPct)}
                  </p>
                )}
              </div>
              <div className="mt-auto">
                <Button asChild variant="outline" size="sm">
                  <Link href="/investimentos">Ver carteira</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Análise" hint="12 meses à frente, e o mês por dentro">
        <Card>
          <CardHeader>
            <CardTitle>Saldo mensal, próximos 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyBalance data={balanceData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>Patrimônio projetado, 12 meses</span>
              {/* O número que o gráfico existe para dar, escrito: a curva mostra
                  a forma, o título mostra o tamanho. */}
              {patrimonyGrowth && (
                <span className={cn("text-sm font-semibold tabular-nums", patrimonyGrowth.deltaCents < 0 ? rose : emerald)}>
                  {patrimonyGrowth.deltaCents < 0 ? "−" : "+"}
                  {formatCents(Math.abs(patrimonyGrowth.deltaCents))}
                  {patrimonyGrowth.pct !== null && `, ${patrimonyGrowth.pct > 0 ? "+" : ""}${patrimonyGrowth.pct}%`}
                </span>
              )}
              <span className="text-xs font-normal text-muted-foreground">reservas + investimentos + saldos previstos · estimado</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SnapshotButton />
              <span className="text-xs text-muted-foreground">
                {currentSnapshot
                  ? `Foto deste mês: ${formatCents(currentSnapshot.totalCents)}, atualizada em ${currentSnapshot.takenAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. O app refaz todo dia.`
                  : "O app passa a registrar caixinhas + carteira todo dia; a foto do mês vira a linha escura do gráfico."}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <PatrimonyChart data={chartPoints} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Despesas por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {hasExpenses ? <ExpensePie data={pieData} /> : <p className="text-sm text-muted-foreground">Sem despesas neste mês</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Maiores despesas</CardTitle>
            </CardHeader>
            <CardContent>
              {hasExpenses ? <RankingBars data={ranking} /> : <p className="text-sm text-muted-foreground">Sem despesas neste mês</p>}
            </CardContent>
          </Card>
        </div>

        {monthBudgets.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Orçamento do mês</CardTitle>
              <Target className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2.5">
                {monthBudgets.map((b) => (
                  <li key={b.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                        {b.name}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          budgetTone(b) === "rose" ? cn("font-semibold", rose) : budgetTone(b) === "emerald" && b.isFloor ? cn("font-semibold", emerald) : "text-muted-foreground",
                        )}
                      >
                        {formatCents(b.plannedCents)} de {formatCents(b.budgetCents)} · {b.pct}%
                        {b.isFloor && (b.pct >= 100 ? " · mínimo batido" : " · mínimo")}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", {
                          "bg-emerald-500": budgetTone(b) === "emerald",
                          "bg-amber-500": budgetTone(b) === "amber",
                          "bg-rose-500": budgetTone(b) === "rose",
                        })}
                        style={{ width: `${Math.min(100, b.pct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" size="sm">
                <Link href="/categorias">Definir metas</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </Section>
    </div>
  );
}

function planLabel(budget: { perDayCents: number } | null): string {
  return budget ? `Plano · reserva do dia a dia de ${formatCents(budget.perDayCents)} por dia` : "Plano";
}
