"use client";
import { useActionState } from "react";
import { PiggyBank } from "lucide-react";
import { setDailyBudget, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Card, CardContent } from "@/components/ui/card";
import { useActionToast } from "@/hooks/use-action-toast";

/**
 * Reserva do dia a dia: mostra o que resta no mês corrente e permite mudar o
 * valor por dia. O texto separa as duas coisas que o usuário poderia confundir
 * — ela é despesa do mês, e não dinheiro guardado nas caixinhas.
 */
export function DailyBudgetCard({
  perDayCents,
  daysRemaining,
  daysInMonth,
  remainingCents,
  monthTotalCents,
}: {
  perDayCents: number;
  daysRemaining: number;
  daysInMonth: number;
  remainingCents: number;
  monthTotalCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setDailyBudget, {});
  useActionToast(state, { success: "Reserva por dia atualizada." });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PiggyBank className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
              Reserva do dia a dia
            </div>
            <div className="text-xl font-bold tabular-nums">{formatCents(remainingCents)}</div>
            <div className="text-[11px] text-muted-foreground">
              {daysRemaining} de {daysInMonth} dias · mês cheio {formatCents(monthTotalCents)}
            </div>
          </div>
        </div>

        <form action={formAction} className="flex flex-col gap-1.5">
          <Label htmlFor="daily-budget-amount">Valor por dia</Label>
          <div className="flex items-center gap-2">
            <CurrencyInput id="daily-budget-amount" name="amountPerDay" defaultCents={perDayCents} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Salvar
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground">
          Entra como despesa do mês e cai a cada dia que passa. Não soma no &quot;Total guardado&quot; — aquilo é
          dinheiro parado em caixinhas.
        </p>
      </CardContent>
    </Card>
  );
}
