import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/Money";
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
export function MonthBalanceCard({ views, className }: { views: EntryView[]; className?: string }) {
  const balance = plannedBalance(views);
  const { pastCents, toComeCents } = monthSplit(views);
  const savedLabel = savedInMonthLabel(balance, savedInMonth(views));

  const linha = (rotulo: string, cents: number) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <Money cents={cents} />
    </div>
  );

  const metade = (titulo: string, entrada: [string, number], saida: [string, number], total: number) => (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{titulo}</div>
      {linha(entrada[0], entrada[1])}
      {linha(saida[0], saida[1])}
      <div className="flex items-baseline justify-between gap-3 border-t pt-1 text-sm font-semibold">
        <span className="text-muted-foreground">{total < 0 ? "faltou" : "sobrou"}</span>
        <Money
          cents={total}
          className={cn(total < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}
        />
      </div>
    </div>
  );

  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wallet className="size-3.5 shrink-0" aria-hidden />
            Saldo do mês
          </div>
          <Money
            cents={balance}
            tabular={false}
            className={cn(
              "text-2xl font-semibold tracking-tight md:text-3xl",
              balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground",
            )}
          />
        </div>

        {/* Duas colunas no desktop, uma embaixo da outra no celular: cada
            metade precisa dos dois números que a compõem ao lado do resultado,
            e espremer isso em meia largura foi o que gerou rótulo cortado. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x">
          {metade("Já aconteceu", ["recebido", receivedIncome(views)], ["pago", paidExpense(views)], pastCents)}
          <div className="sm:pl-4">
            {metade("Falta acontecer", ["a receber", remainingToReceive(views)], ["a pagar", remainingToPay(views)], toComeCents)}
          </div>
        </div>

        {savedLabel && <p className="mt-auto text-xs text-muted-foreground">{savedLabel}</p>}
      </CardContent>
    </Card>
  );
}
