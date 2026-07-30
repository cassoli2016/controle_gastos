import Link from "next/link";
import { upcomingRenewals, renewalLabel, MONTH_NAMES } from "@/lib/renewals";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { calcPortfolio, formatPct } from "@/lib/investments";
import { TrendingUp, CalendarX2, PiggyBank, BellRing, CreditCard as CreditCardIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getNegativeMonths, getReserves, getDailyBudget } from "@/lib/planning";
import { dailyBudgetLine } from "@/lib/daily-budget";
import { Button } from "@/components/ui/button";
import { monthToDate, formatCompetencia } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView, dailyBudgetEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents, sumCents, decimalToCents } from "@/lib/money";
import { upcomingCardCommitments } from "@/lib/card-entry";
import { MonthStatCards } from "@/components/MonthStatCards";
import { MonthNav } from "@/components/MonthNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { MonthlyBalance, type MonthlyBalancePoint } from "@/components/charts/MonthlyBalance";
import { RankingBars } from "@/components/charts/RankingBars";
import { installmentMonths } from "@/lib/installments";
import { monthStringFromDate } from "@/lib/dates";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? (await resolveDefaultMonth());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } }, category: true },
  });
  const realViews = rows.map((r) => toEntryView(r as never));

  // Planejamento: meses futuros no vermelho × total guardado nas caixinhas.
  // categories não depende de budget (só pieData depende) — entra no mesmo
  // Promise.all para não rodar em série à toa.
  const [negativeMonths, reserves, investAssets, renewalItems, budget, categories] = await Promise.all([
    getNegativeMonths(),
    getReserves(),
    prisma.investmentAsset.findMany({ where: { active: true, quantity: { gt: 0 } } }),
    prisma.item.findMany({ where: { active: true, renewalMonth: { not: null } }, select: { name: true, renewalMonth: true } }),
    getDailyBudget(),
    prisma.category.findMany(),
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

  const catColor = new Map(categories.map((c) => [c.name, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({
    categoryName: x.categoryName,
    value: x.cents,
    color: catColor.get(x.categoryName) ?? "#64748b",
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
  const balanceData: MonthlyBalancePoint[] = chartMonths.map((m) => {
    const base = viewsByMonth.get(m) ?? [];
    // Cada mês do gráfico carrega a sua reserva: mês cheio à frente, decaindo
    // no corrente, zero atrás. Mesma regra da tela Mês: mês sem nenhum
    // lançamento real fica de fora — senão o gráfico desenharia saldo
    // negativo fabricado para meses futuros sem lançamento nenhum.
    const v =
      base.length === 0
        ? base
        : budget
          ? [...base, dailyBudgetEntryView(dailyBudgetLine(m, today, budget.perDayCents))]
          : base;
    return {
      month: formatCompetencia(monthToDate(m)),
      incomeCents: plannedIncome(v),
      expenseCents: plannedExpense(v),
      balanceCents: plannedBalance(v),
    };
  });

  // Compras de cartão já roteadas para as faturas dos 3 meses seguintes:
  // reaproveita rangeRows (12 meses já buscados para o gráfico). Visibilidade
  // apenas — o gasto conta no mês em que a fatura vence.
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  : `${investAssets.length} ativos · resultado ${formatCents(portfolio.resultCents)} (${formatPct(portfolio.resultPct)})`}
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo mensal (próximos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBalance data={balanceData} />
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
