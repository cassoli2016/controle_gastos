import { TrendingUp, TrendingDown, Wallet, Clock } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import {
  plannedIncome,
  plannedExpense,
  plannedBalance,
  savedInMonth,
  balanceToCome,
  remainingToReceive,
  remainingToPay,
  paidExpense,
  receivedIncome,
  progressPct,
  type EntryView,
} from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { savedInMonthLabel } from "@/lib/reserve-flow";
import type { DailyBudgetLine } from "@/lib/daily-budget";

/**
 * Grade dos 4 cards do mês (Dashboard e tela Mês, sempre iguais).
 * `views` = lançamentos + linha derivada da reserva; `realViews` = só os
 * lançamentos do banco — a contagem "N contas" não inclui a reserva, que não
 * é conta pagável.
 */
export function MonthStatCards({
  views,
  realViews,
  budgetLine,
}: {
  views: EntryView[];
  realViews: EntryView[];
  budgetLine: DailyBudgetLine | null;
}) {
  const incomeTotal = plannedIncome(views);
  const expenseTotal = plannedExpense(views);
  const paidExp = paidExpense(views);
  const remaining = remainingToPay(views);
  const receivedInc = receivedIncome(views);
  const balance = plannedBalance(views);
  // Guardar não entra no saldo (não é gasto), mas some da tela se não for dito
  // em algum lugar: o mês em que a sobra foi para a caixinha parece igual ao
  // mês em que ela ficou parada na conta.
  const savedDetail = savedInMonthLabel(balance, savedInMonth(views)) ?? undefined;

  const unpaidCount = realViews.filter((v) => v.categoryType === "EXPENSE" && !v.paid).length;
  const contasLabel = `${unpaidCount} ${unpaidCount === 1 ? "conta" : "contas"}`;
  const faltaDetail = budgetLine && budgetLine.cents > 0 ? `${contasLabel} + reserva` : contasLabel;

  // "Falta pagar" sozinho não diz se dá para pagar: o card Saldo soma o mês
  // inteiro e conta receita que já entrou E já foi gasta. Este é o confronto
  // com o que AINDA entra — a mesma métrica do rodapé do Panorama.
  const toCome = balanceToCome(views);
  const toReceive = remainingToReceive(views);
  const toComeDetail =
    remaining === 0
      ? undefined
      : toCome < 0
        ? `${formatCents(toReceive)} a receber · faltam ${formatCents(-toCome)}`
        : `${formatCents(toReceive)} a receber · sobram ${formatCents(toCome)}`;
  const toComeShort =
    remaining === 0 ? undefined : toCome < 0 ? `faltam ${formatCents(-toCome)}` : `sobram ${formatCents(toCome)}`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Receitas"
        value={formatCents(incomeTotal)}
        tone="income"
        icon={TrendingUp}
        detail={
          incomeTotal > 0
            ? `${formatCents(receivedInc)} recebido · ${formatCents(incomeTotal - receivedInc)} a receber`
            : "nenhuma receita lançada"
        }
        detailShort={incomeTotal > 0 ? `${formatCents(incomeTotal - receivedInc)} a receber` : undefined}
        progress={incomeTotal > 0 ? progressPct(receivedInc, incomeTotal) : undefined}
      />
      <StatCard
        label="Despesas"
        value={formatCents(expenseTotal)}
        tone="expense"
        icon={TrendingDown}
        detail={`${formatCents(paidExp)} pago · ${formatCents(remaining)} falta`}
        detailShort={`${formatCents(remaining)} falta`}
        progress={progressPct(paidExp, expenseTotal)}
      />
      {incomeTotal === 0 ? (
        // Sem receita lançada o saldo seria só "-despesas": número fabricado
        // que assusta. Mostra o traço e explica, em vez de mentir precisão.
        <StatCard label="Saldo" value="—" icon={Wallet} detail="sem receitas lançadas" />
      ) : (
        <StatCard
          label="Saldo"
          value={formatCents(balance)}
          tone={balance < 0 ? "expense" : "default"}
          icon={Wallet}
          detail={savedDetail}
        />
      )}
      <StatCard
        label="Falta pagar"
        value={formatCents(remaining)}
        tone="warn"
        icon={Clock}
        detail={toComeDetail ?? faltaDetail}
        detailShort={toComeShort}
      />
    </div>
  );
}
