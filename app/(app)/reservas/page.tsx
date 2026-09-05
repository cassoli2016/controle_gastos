import { PiggyBank } from "lucide-react";
import { getReserves, getNegativeMonths, getDailyBudget, getReserveStatements } from "@/lib/planning";
import { dailyBudget } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { sumCents, formatCents } from "@/lib/money";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { NewReserveForm } from "./NewReserveForm";
import { ReserveCard } from "./ReserveCard";
import { DailyBudgetCard } from "./DailyBudgetCard";
import { prisma } from "@/lib/prisma";
import { monthToDate } from "@/lib/dates";
import { realizedCashBalance } from "@/lib/calc";
import { toEntryView } from "@/lib/entries";

/**
 * Quanto ainda dá para guardar neste mês: o que entrou menos o que saiu,
 * contando só o que já foi baixado E descontando o que já foi para as
 * caixinhas.
 *
 * Nenhuma das métricas vizinhas serve aqui: o card "Saldo" do Mês ignora a
 * baixa (contaria salário que não caiu) e o `realizedBalance` ignora os
 * depósitos (sugeriria guardar de novo o dinheiro que já está guardado).
 */
async function getMonthLeftover(): Promise<number> {
  const month = todayISOInSaoPaulo().slice(0, 7);
  const entries = await prisma.monthlyEntry.findMany({
    where: { month: monthToDate(month) },
    include: { item: { include: { category: true } }, category: true },
  });
  return realizedCashBalance(entries.map(toEntryView));
}

export default async function ReservasPage() {
  const [reserves, negativeMonths, budget, leftoverCents, statements] = await Promise.all([
    getReserves(),
    getNegativeMonths(),
    getDailyBudget(),
    getMonthLeftover(),
    getReserveStatements(),
  ]);
  const totalCents = sumCents(reserves.map((r) => r.amountCents));
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo
  const today = todayISOInSaoPaulo();
  const budgetView = budget ? dailyBudget(today.slice(0, 7), today, budget.perDayCents) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <NewReserveForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard label="Total guardado" value={formatCents(totalCents)} tone="income" icon={PiggyBank} />
        {uncoveredCents < 0 && (
          <StatCard
            label="Descoberto (meses no vermelho)"
            value={formatCents(uncoveredCents)}
            tone="expense"
          />
        )}
      </div>

      {budgetView && (
        <DailyBudgetCard
          perDayCents={budgetView.perDayCents}
          daysRemaining={budgetView.daysRemaining}
          daysInMonth={budgetView.daysInMonth}
          remainingCents={budgetView.remainingCents}
          monthTotalCents={budgetView.monthTotalCents}
        />
      )}

      {reserves.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <PiggyBank className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma caixinha ainda.</p>
            <p className="text-sm text-muted-foreground">
              Crie caixinhas para organizar sua reserva de emergência — quantas quiser.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reserves.map((r) => (
            <ReserveCard
              key={r.id}
              reserve={r}
              leftoverCents={leftoverCents}
              statement={statements[r.id] ?? { lines: [], check: { ok: false, differenceCents: r.amountCents } }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
