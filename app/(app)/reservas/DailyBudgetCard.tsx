"use client";
import { useActionState } from "react";
import { PiggyBank } from "lucide-react";
import { setDailyBudget, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Money } from "@/components/Money";
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
  observed = null,
}: {
  perDayCents: number;
  daysRemaining: number;
  daysInMonth: number;
  remainingCents: number;
  monthTotalCents: number;
  /** Gasto à vista real no cartão nos últimos ciclos fechados, por dia; null sem ciclo. */
  observed?: { perDayCents: number; label: string } | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setDailyBudget, {});
  useActionToast(state, { success: "Reserva por dia atualizada." });

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <PiggyBank className="size-3.5 shrink-0" aria-hidden />
            Reserva do dia a dia
          </div>
          <Money cents={remainingCents} tabular={false} className="block text-2xl font-semibold tracking-tight" />
          <div className="text-[11px] text-muted-foreground">
            {daysRemaining} de {daysInMonth} dias · mês cheio {formatCents(monthTotalCents)}
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

        {/* O número ao lado do configurado: é a diferença entre o plano e o que
            vem acontecendo. Sem ele a projeção parecia confirmar um gasto que a
            fatura desmentia todo mês. */}
        {observed && (
          <p
            className={
              observed.perDayCents > perDayCents
                ? "text-xs font-medium text-amber-700 dark:text-amber-400"
                : "text-xs font-medium text-emerald-700 dark:text-emerald-400"
            }
          >
            Gasto à vista real no cartão: {formatCents(observed.perDayCents)}/dia (média de {observed.label}).
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Entra como despesa do mês e cai a cada dia que passa. Não soma no &quot;Total guardado&quot; — aquilo é
          dinheiro parado em caixinhas.
        </p>
      </CardContent>
    </Card>
  );
}
