import Link from "next/link";
import { upcomingRenewals, renewalLabel, MONTH_NAMES } from "@/lib/renewals";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { calcPortfolio, formatPct } from "@/lib/investments";
import { TrendingUp, CalendarX2, PiggyBank, BellRing, CreditCard as CreditCardIcon, Target, AlarmClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getNegativeMonths, getReserves, getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { Button } from "@/components/ui/button";
import { monthToDate, formatCompetencia, sanitizeMonth } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView, cardEstimateEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents, sumCents, decimalToCents } from "@/lib/money";
import { upcomingCardCommitments } from "@/lib/card-entry";
import { budgetLines } from "@/lib/budget";
import { patrimonyProjection } from "@/lib/patrimony";
import { seriesGrowth } from "@/lib/chart-scale";
import { dueSoon } from "@/lib/due-soon";
import { cardEstimateLines } from "@/lib/card-estimate";
import { usageTone } from "@/lib/card-usage";
import { cn } from "@/lib/utils";
import { MonthStatCards } from "@/components/MonthStatCards";
import { MonthNav } from "@/components/MonthNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { MonthlyBalance, type MonthlyBalancePoint } from "@/components/charts/MonthlyBalance";
import { PatrimonyChart } from "@/components/charts/PatrimonyChart";
import { RankingBars } from "@/components/charts/RankingBars";
import { installmentMonths } from "@/lib/installments";
import { monthStringFromDate } from "@/lib/dates";

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
      dueDay: r.item?.dueDay ?? null,
      readOnlyHint: null,
    })),
    month,
    todayISOInSaoPaulo(),
    7,
  );

  // Planejamento: meses futuros no vermelho × total guardado nas caixinhas.
  // categories não depende de budget (só pieData depende) — entra no mesmo
  // Promise.all para não rodar em série à toa.
  const [negativeMonths, reserves, investAssets, renewalItems, budget, categories, activeCards] = await Promise.all([
    getNegativeMonths(),
    getReserves(),
    prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } }),
    prisma.item.findMany({ where: { active: true, renewalMonth: { not: null } }, select: { name: true, renewalMonth: true } }),
    getDailyBudget(),
    prisma.category.findMany(),
    prisma.creditCard.findMany({ where: { active: true }, select: { id: true, name: true, monthlyEstimate: true } }),
  ]);
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

  const monthlyViews = chartMonths.map((m) => {
    const base = viewsByMonth.get(m) ?? [];
    const estimadas = cardEstimateLines(estimateCards, m, month, bookedByMonthCard.get(m) ?? {}).map(
      cardEstimateEntryView,
    );
    return {
      month: formatCompetencia(monthToDate(m)),
      views:
        base.length === 0
          ? base
          : budget
            ? [...base, dailyBudgetEntryView(dailyBudgetLine(m, today, budget.perDayCents)), ...estimadas]
            : [...base, ...estimadas],
    };
  });
  const balanceData: MonthlyBalancePoint[] = monthlyViews.map(({ month: m, views: v }) => ({
    month: m,
    incomeCents: plannedIncome(v),
    expenseCents: plannedExpense(v),
    balanceCents: plannedBalance(v),
  }));

  // Patrimônio projetado: caixinhas + carteira hoje, somando o saldo de CAIXA
  // de cada mês — não o saldo do gráfico acima, que ignora as transferências.
  // O ponto de partida já contém o dinheiro das caixinhas; usar o saldo do mês
  // contaria um depósito duas vezes. Estimativa — investimentos flutuam.
  const patrimonyData = patrimonyProjection(reservesTotalCents + portfolio.valueCents, monthlyViews);
  const patrimonyGrowth = seriesGrowth(patrimonyData.map((p) => p.totalCents));

  // Compras de cartão já roteadas para as faturas dos 3 meses seguintes:
  // reaproveita rangeRows (12 meses já buscados para o gráfico). Visibilidade
  // apenas — o gasto conta no mês em que a fatura vence.
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
      })),
  );

  const nextThree = new Set(chartMonths.slice(1, 4));
  const upcomingFaturas = upcomingCardCommitments(
    rangeRows
      .filter((r) => r.cardId !== null && nextThree.has(monthStringFromDate(r.month)))
      .map((r) => ({ month: monthStringFromDate(r.month), plannedCents: decimalToCents(String(r.plannedAmount)) })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <MonthNav month={month} basePath="/dashboard" />
      </div>

      <MonthStatCards views={views} realViews={realViews} budgetLine={budgetLine} />

      {vencendo.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <AlarmClock className="size-4 text-amber-600 dark:text-amber-400" />
                Vence em breve
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatCents(vencendo.reduce((a, r) => a + r.cents, 0))}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ul className="divide-y border-t">
              {vencendo.slice(0, 6).map((r) => (
                <li key={r.entryId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm md:px-6">
                  <span className="min-w-0 truncate">{r.itemName}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        r.overdue ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                      )}
                    >
                      {r.overdue
                        ? "atrasada"
                        : r.daysLeft === 0
                          ? "vence hoje"
                          : r.daysLeft === 1
                            ? "amanhã"
                            : `em ${r.daysLeft} dias`}
                    </span>
                    <span className="tabular-nums">{formatCents(r.cents)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t px-4 py-2 md:px-6">
              <span className="text-xs text-muted-foreground">
                {vencendo.length > 6 ? `e mais ${vencendo.length - 6} nos próximos dias` : "\u00A0"}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/mes?month=${month}`}>Pagar no Mês</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* items-start: cada card fica com a altura do próprio conteúdo. Sem
          isso, "Renovações" sem renovação nenhuma esticava para acompanhar o
          card ao lado — 190px para uma frase. */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Meses no vermelho</CardTitle>
            <CalendarX2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {negativeMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum mês com saldo previsto negativo. 🎉
              </p>
            ) : (
              <>
                <div>
                  <div className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatCents(uncoveredCents)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Soma dos saldos negativos de {negativeMonths.length}{" "}
                    {negativeMonths.length === 1 ? "mês" : "meses"} (do atual em diante)
                  </p>
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {negativeMonths.map((m) => (
                    <li key={m.month} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{formatCompetencia(monthToDate(m.month))}</span>
                      <span className="tabular-nums text-rose-600 dark:text-rose-400">
                        {formatCents(m.balanceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Investimentos</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-2xl font-bold tabular-nums">{formatCents(portfolio.valueCents)}</div>
              <p className="text-xs text-muted-foreground">
                {investAssets.length === 0
                  ? "Nenhuma posição ainda"
                  : `${investAssets.length} ativos · investido ${formatCents(portfolio.costCents)} · resultado ${formatCents(portfolio.resultCents)} (${formatPct(portfolio.resultPct)})`}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/investimentos">Ver carteira</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Reservas</CardTitle>
            <PiggyBank className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCents(reservesTotalCents)}
              </div>
              <p className="text-xs text-muted-foreground">
                {reserves.length === 0
                  ? "Nenhuma caixinha ainda"
                  : `Guardado em ${reserves.length} ${reserves.length === 1 ? "caixinha" : "caixinhas"}`}
              </p>
            </div>
            {uncoveredCents < 0 && (
              <p className="text-sm">
                {reservesTotalCents + uncoveredCents >= 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Cobrem todo o descoberto — sobram {formatCents(reservesTotalCents + uncoveredCents)}.
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    Cobrem {Math.round((reservesTotalCents / -uncoveredCents) * 100)}% do descoberto —
                    faltam {formatCents(-(reservesTotalCents + uncoveredCents))}.
                  </span>
                )}
              </p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/reservas">Gerenciar caixinhas</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Renovações</CardTitle>
            <BellRing className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {renewals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma renovação nos próximos 3 meses.
                {renewalItems.length === 0 && " Configure o mês de renovação nos Itens (ex.: seguro)."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {renewals.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span
                      className={
                        r.monthsAway === 0
                          ? "text-amber-600 dark:text-amber-400 font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {r.monthsAway === 0 ? "este mês ⚠️" : MONTH_NAMES[r.renewalMonth - 1]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/itens">Configurar itens</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Próximas faturas</CardTitle>
            <CreditCardIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingFaturas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada comprometido nas próximas faturas.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcomingFaturas.map((f) => (
                  <li key={f.month} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{formatCompetencia(monthToDate(f.month))}</span>
                    <span className="font-medium tabular-nums">{formatCents(f.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Compras no cartão que já vão cair nos próximos meses.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/cartoes">Ver cartões</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Orçamento do mês</CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {monthBudgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma categoria com meta ainda. Defina a meta mensal ao editar uma categoria.
              </p>
            ) : (
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
                          "tabular-nums text-xs",
                          b.pct > 100 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        {formatCents(b.plannedCents)} de {formatCents(b.budgetCents)} · {b.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", {
                          "bg-emerald-500": usageTone(b.pct) === "emerald",
                          "bg-amber-500": usageTone(b.pct) === "amber",
                          "bg-rose-500": usageTone(b.pct) === "rose",
                        })}
                        style={{ width: `${Math.min(100, b.pct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/categorias">Definir metas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo mensal (próximos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBalance data={balanceData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>Patrimônio projetado (12 meses)</span>
            {/* O número que o gráfico existe para dar, escrito: a curva mostra
                a forma, o título mostra o tamanho. */}
            {patrimonyGrowth && (
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  patrimonyGrowth.deltaCents < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {patrimonyGrowth.deltaCents < 0 ? "−" : "+"}
                {formatCents(Math.abs(patrimonyGrowth.deltaCents))}
                {patrimonyGrowth.pct !== null && ` (${patrimonyGrowth.pct > 0 ? "+" : ""}${patrimonyGrowth.pct}%)`}
              </span>
            )}
            <span className="text-xs font-normal text-muted-foreground">
              reservas + investimentos + saldos previstos · estimado
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PatrimonyChart data={patrimonyData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {hasExpenses ? (
              <ExpensePie data={pieData} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem despesas neste mês</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ranking de despesas</CardTitle>
          </CardHeader>
          <CardContent>
            {hasExpenses ? (
              <RankingBars data={ranking} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem despesas neste mês</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
