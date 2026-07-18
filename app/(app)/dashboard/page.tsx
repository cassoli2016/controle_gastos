import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { StatCard } from "@/components/StatCard";
import { MonthNav } from "@/components/MonthNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { BalanceProjection } from "@/components/charts/BalanceProjection";
import { RankingBars } from "@/components/charts/RankingBars";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qMonth } = await searchParams;
  const month = qMonth ?? monthStringFromDate(new Date());
  const monthDate = monthToDate(month);

  const rows = await prisma.monthlyEntry.findMany({
    where: { month: monthDate },
    include: { item: { include: { category: true } } },
  });
  const views = rows.map((r) => toEntryView(r as never));

  const catColor = new Map((await prisma.category.findMany()).map((c) => [c.name, c.color]));
  const pieData = expenseByCategory(views).map((x) => ({ categoryName: x.categoryName, value: x.cents, color: catColor.get(x.categoryName) ?? "#64748b" }));
  const ranking = expenseRanking(views).slice(0, 10);
  const hasExpenses = ranking.length > 0;

  // Projeção: saldo previsto dos próximos 6 meses
  const proj: { month: string; balance: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const d = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + k, 1));
    const r = await prisma.monthlyEntry.findMany({ where: { month: d }, include: { item: { include: { category: true } } } });
    proj.push({ month: formatCompetencia(d), balance: plannedBalance(r.map((x) => toEntryView(x as never))) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard — {formatCompetencia(monthDate)}</h1>
        <MonthNav month={month} basePath="/dashboard" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Receitas" value={formatCents(plannedIncome(views))} tone="income" />
        <StatCard label="Despesas" value={formatCents(plannedExpense(views))} tone="expense" />
        <StatCard label="Saldo" value={formatCents(plannedBalance(views))} tone="default" />
        <StatCard label="Falta pagar" value={formatCents(remainingToPay(views))} tone="warn" />
      </div>

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
            <CardTitle>Projeção de saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceProjection data={proj} />
          </CardContent>
        </Card>
      </div>

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
  );
}
