import { prisma } from "@/lib/prisma";
import { monthToDate, monthStringFromDate, formatCompetencia } from "@/lib/dates";
import { toEntryView } from "@/lib/entries";
import { plannedIncome, plannedExpense, plannedBalance, remainingToPay, expenseByCategory, expenseRanking } from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { ExpensePie } from "@/components/charts/ExpensePie";
import { BalanceProjection } from "@/components/charts/BalanceProjection";

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

  // Projeção: saldo previsto dos próximos 6 meses
  const proj: { month: string; balance: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const d = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + k, 1));
    const r = await prisma.monthlyEntry.findMany({ where: { month: d }, include: { item: { include: { category: true } } } });
    proj.push({ month: formatCompetencia(d), balance: plannedBalance(r.map((x) => toEntryView(x as never))) });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard — {formatCompetencia(monthDate)}</h1>
      <div className="grid grid-cols-4 gap-3">
        <Card label="Receitas" value={formatCents(plannedIncome(views))} />
        <Card label="Despesas" value={formatCents(plannedExpense(views))} />
        <Card label="Saldo" value={formatCents(plannedBalance(views))} />
        <Card label="Falta pagar" value={formatCents(remainingToPay(views))} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <section><h2 className="mb-2 font-medium">Despesas por categoria</h2><ExpensePie data={pieData} /></section>
        <section><h2 className="mb-2 font-medium">Projeção de saldo</h2><BalanceProjection data={proj} /></section>
      </div>
      <section>
        <h2 className="mb-2 font-medium">Ranking de despesas</h2>
        <ol className="list-decimal pl-6">
          {expenseRanking(views).slice(0, 10).map((x, i) => (
            <li key={i} className="flex justify-between"><span>{x.itemName}</span><span>{formatCents(x.cents)}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
