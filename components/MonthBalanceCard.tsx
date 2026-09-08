import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  plannedBalance,
  monthSplit,
  savedInMonth,
  receivedIncome,
  paidExpense,
  remainingToReceive,
  remainingToPay,
  type EntryView,
} from "@/lib/calc";
import { formatCents } from "@/lib/money";
import { savedInMonthLabel } from "@/lib/reserve-flow";

/**
 * O saldo do mês com as quatro pontas que o formam.
 *
 * Card próprio, e não uma linha no StatCard estreito, porque a pergunta que
 * ele responde não cabe em rótulo abreviado: "se ainda tenho R$ 15.833,00 a
 * receber e só R$ 5.390,66 a pagar, por que o saldo está negativo?". A
 * resposta é que o card do saldo fala do mês INTEIRO e o "falta pagar" fala só
 * do futuro — aqui as duas metades aparecem lado a lado e somam o total.
 */
export function MonthBalanceCard({ views }: { views: EntryView[] }) {
  const balance = plannedBalance(views);
  const { pastCents, toComeCents } = monthSplit(views);
  const savedLabel = savedInMonthLabel(balance, savedInMonth(views));

  const linha = (rotulo: string, cents: number) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  );

  const metade = (
    titulo: string,
    entrada: [string, number],
    saida: [string, number],
    total: number,
  ) => (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {linha(entrada[0], entrada[1])}
      {linha(saida[0], saida[1])}
      <div className="flex items-baseline justify-between gap-3 border-t pt-1 text-sm font-semibold">
        <span className="text-muted-foreground">{total < 0 ? "faltou" : "sobrou"}</span>
        <span
          className={cn(
            "tabular-nums",
            total < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {total < 0 ? "−" : "+"}
          {formatCents(Math.abs(total))}
        </span>
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              balance < 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-primary/10 text-primary",
            )}
          >
            <Wallet className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Saldo do mês
            </div>
            <div
              className={cn(
                "text-xl font-bold tabular-nums",
                balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground",
              )}
            >
              {formatCents(balance)}
            </div>
          </div>
        </div>

        {/* Duas colunas no desktop, uma embaixo da outra no celular: cada
            metade precisa dos dois números que a compõem ao lado do resultado,
            e espremer isso em meia largura foi o que gerou rótulo cortado. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x">
          {metade(
            "Já aconteceu",
            ["recebido", receivedIncome(views)],
            ["pago", paidExpense(views)],
            pastCents,
          )}
          <div className="sm:pl-4">
            {metade(
              "Falta acontecer",
              ["a receber", remainingToReceive(views)],
              ["a pagar", remainingToPay(views)],
              toComeCents,
            )}
          </div>
        </div>

        {savedLabel && <p className="text-xs text-muted-foreground">{savedLabel}</p>}
      </CardContent>
    </Card>
  );
}
