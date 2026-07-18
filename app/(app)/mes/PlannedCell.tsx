"use client";
import { useActionState, useState } from "react";
import { upsertEntry, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActionToast } from "@/hooks/use-action-toast";

export function PlannedCell({
  itemId,
  month,
  plannedCents,
}: {
  itemId: string;
  month: string;
  plannedCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(upsertEntry, {});
  useActionToast(state, { success: "Previsto atualizado." });

  const [open, setOpen] = useState(false);
  // Fecha o popover assim que a action retorna sucesso (padrão "adjust state
  // while rendering" do React, evita useEffect + setState em cascata).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const fieldId = `plannedAmount-${itemId}-${month}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="font-medium tabular-nums">
          {formatCents(plannedCents)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <form action={formAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="month" value={month} />
          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="text-xs text-muted-foreground">
              Valor previsto
            </label>
            <CurrencyInput id={fieldId} name="plannedAmount" defaultCents={plannedCents} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
