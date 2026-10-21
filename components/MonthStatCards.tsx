import { TrendingUp, TrendingDown, Clock, Wallet } from "lucide-react";
import { StatStrip, type StatItem } from "@/components/StatCard";
import {
  plannedIncome,
  plannedExpense,
  plannedBalance,
  balanceToCome,
  remainingToReceive,
  remainingToPay,
  paidExpense,
  receivedIncome,
  progressPct,
  type EntryView,
} from "@/lib/calc";
import { formatCents } from "@/lib/money";
import type { DailyBudgetLine } from "@/lib/daily-budget";

/**
 * Os números do mês numa faixa só (Dashboard e tela Mês, sempre iguais).
 * `views` = lançamentos + linha derivada da reserva; `realViews` = só os
 * lançamentos do banco — a contagem "N contas" não inclui a reserva, que não
 * é conta pagável.
 *
 * `withBalance` acrescenta o saldo do mês como quarto número: a tela Mês não
 * tem o card do saldo (a lista é a protagonista lá), mas o número precisa
 * continuar à vista.
 */
export function MonthStatCards({
  views,
  realViews,
  budgetLine,
  withBalance = false,
}: {
  views: EntryView[];
  realViews: EntryView[];
  budgetLine: DailyBudgetLine | null;
  withBalance?: boolean;
}) {
  const incomeTotal = plannedIncome(views);
  const expenseTotal = plannedExpense(views);
  const paidExp = paidExpense(views);
  const remaining = remainingToPay(views);
  const receivedInc = receivedIncome(views);

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

  const items: StatItem[] = [
    {
      label: "Receitas",
      cents: incomeTotal,
      tone: "income",
      icon: TrendingUp,
      detail:
        incomeTotal > 0
          ? `${formatCents(receivedInc)} recebido · ${formatCents(incomeTotal - receivedInc)} a receber`
          : "nenhuma receita lançada",
      detailShort: incomeTotal > 0 ? `${formatCents(incomeTotal - receivedInc)} a receber` : undefined,
      progress: incomeTotal > 0 ? progressPct(receivedInc, incomeTotal) : undefined,
    },
    {
      label: "Despesas",
      cents: expenseTotal,
      tone: "expense",
      icon: TrendingDown,
      detail: `${formatCents(paidExp)} pago · ${formatCents(remaining)} falta`,
      detailShort: `${formatCents(remaining)} falta`,
      progress: progressPct(paidExp, expenseTotal),
    },
    {
      label: "Falta pagar",
      cents: remaining,
      tone: "warn",
      icon: Clock,
      detail: toComeDetail ?? faltaDetail,
      detailShort: toComeShort,
    },
  ];
  if (withBalance) {
    const balance = plannedBalance(views);
    items.push({
      label: "Saldo do mês",
      cents: balance,
      tone: balance < 0 ? "expense" : "default",
      icon: Wallet,
      detail: "receitas menos despesas, pagas ou não",
    });
  }

  return <StatStrip items={items} />;
}
