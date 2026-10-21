import { PiggyBank, CalendarX2, Wallet } from "lucide-react";
import {
  getReserves,
  getNegativeMonths,
  getDailyBudget,
  getReserveStatements,
  getCurrentMonthLeftover,
  getObservedVariableSpend,
  freeReserveCents,
} from "@/lib/planning";
import { cyclesLabel } from "@/lib/trend";
import { dailyBudget } from "@/lib/daily-budget";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { sumCents, formatCents } from "@/lib/money";
import { StatStrip, type StatItem } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { NewReserveForm } from "./NewReserveForm";
import { ReserveCard } from "./ReserveCard";
import { DailyBudgetCard } from "./DailyBudgetCard";

// Quanto ainda dá para guardar neste mês vem de `getCurrentMonthLeftover`
// (lib/planning): só o que já foi baixado, descontando o que já foi para as
// caixinhas. O card "Saldo" do Mês ignora a baixa e o `realizedBalance` ignora
// os depósitos — nenhum dos dois serve para sugerir quanto guardar.
export default async function ReservasPage() {
  const [reserves, negativeMonths, budget, leftoverCents, statements, observed] = await Promise.all([
    getReserves(),
    getNegativeMonths(),
    getDailyBudget(),
    getCurrentMonthLeftover(),
    getReserveStatements(),
    getObservedVariableSpend(),
  ]);
  const totalCents = sumCents(reserves.map((r) => r.amountCents));
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo
  const freeCents = freeReserveCents(totalCents, negativeMonths);
  const today = todayISOInSaoPaulo();
  const budgetView = budget ? dailyBudget(today.slice(0, 7), today, budget.perDayCents) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Reservas</h1>
        <NewReserveForm />
      </div>

      {/* Guardado, descoberto e saldo livre numa faixa só: é uma conta
          (guardado − meses no vermelho = livre), e os filetes a mantêm junta. */}
      <StatStrip
        items={[
          { label: "Total guardado", value: formatCents(totalCents), tone: "income", icon: PiggyBank },
          ...(uncoveredCents < 0
            ? ([
                {
                  label: "Descoberto (meses no vermelho)",
                  value: formatCents(uncoveredCents),
                  tone: "expense",
                  icon: CalendarX2,
                },
                {
                  label: "Saldo livre",
                  value: formatCents(freeCents),
                  tone: freeCents < 0 ? "expense" : "income",
                  icon: Wallet,
                  detail: "guardado menos os meses no vermelho",
                },
              ] satisfies StatItem[])
            : []),
        ]}
      />

      {budgetView && (
        <DailyBudgetCard
          perDayCents={budgetView.perDayCents}
          daysRemaining={budgetView.daysRemaining}
          daysInMonth={budgetView.daysInMonth}
          remainingCents={budgetView.remainingCents}
          monthTotalCents={budgetView.monthTotalCents}
          observed={observed ? { perDayCents: observed.perDayCents, label: cyclesLabel(observed.cycles) } : null}
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
