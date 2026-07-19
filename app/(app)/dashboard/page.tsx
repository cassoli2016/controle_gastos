import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, Clock, CalendarX2, PiggyBank } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getNegativeMonths, getReserves } from "@/lib/planning";
import { Button } from "@/components/ui/button";
import { monthToDate, formatCompetencia } from "@/lib/dates";
import { resolveDefaultMonth } from "@/lib/default-month";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents, sumCents } from "@/lib/money";
import { StatCard } from "@/components/StatCard";
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
  const views = rows.map((r) => toEntryView(r as never));

  const catColor = new Map((await prisma.category.findMany()).map((c) => [c.name, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({ categoryName: x.categoryName, value: x.cents, color: catColor.get(x.categoryName) ?? "#64748b" }));
  const ranking = expenseRanking(views).slice(0, 10);
  const hasExpenses = ranking.length > 0;

  // Planejamento: meses futuros no vermelho × total guardado nas caixinhas.
  const [negativeMonths, reserves] = await Promise.all([getNegativeMonths(), getReserves()]);
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo
  const reservesTotalCents = sumCents(reserves.map((r) => r.amountCents));

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
    const v = viewsByMonth.get(m) ?? [];
    return {
      month: formatCompetencia(monthToDate(m)),
      incomeCents: plannedIncome(v),
      expenseCents: plannedExpense(v),
      balanceCents: plannedBalance(v),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <MonthNav month={month} basePath="/dashboard" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" icon={TrendingUp} />
        <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" icon={TrendingDown} />
        <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone={plannedBalance(views) < 0 ? "expense" : "default"} icon={Wallet} />
        <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" icon={Clock} />
      </div>

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
