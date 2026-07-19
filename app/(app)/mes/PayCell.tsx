"use client";
import { useActionState, useState } from "react";
import { markPaid, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActionToast } from "@/hooks/use-action-toast";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : todayISO();
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function PayCell({
  entryId,
  plannedCents,
  paid,
  paidCents,
  paidDate,
  income = false,
}: {
  entryId: string;
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  paidDate: Date | null;
  /** Receita (categoria INCOME): vocabulário "Receber/Recebido" em vez de "Pagar/Pago". */
  income?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(markPaid, {});
  useActionToast(state, { success: income ? "Recebimento atualizado." : "Pagamento atualizado." });

  const [open, setOpen] = useState(false);
  // Fecha o popover assim que a action retorna sucesso (padrão "adjust state
  // while rendering" do React, evita useEffect + setState em cascata).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  if (paid) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="paid" value="false" />
        <span className="font-medium tabular-nums">{paidCents !== null ? formatCents(paidCents) : "—"}</span>
        <span className="text-xs text-muted-foreground">
          {paidDate ? formatDateBR(toDateInputValue(paidDate)) : ""}
        </span>
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          Desmarcar
        </Button>
      </form>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          {income ? "Receber" : "Pagar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form action={formAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="paid" value="true" />
          <div className="flex flex-col gap-1">
            <label htmlFor={`paidAmount-${entryId}`} className="text-xs text-muted-foreground">
              {income ? "Valor recebido" : "Valor pago"}
            </label>
            <CurrencyInput id={`paidAmount-${entryId}`} name="paidAmount" defaultCents={plannedCents} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`paidDate-${entryId}`} className="text-xs text-muted-foreground">
              {income ? "Data do recebimento" : "Data do pagamento"}
            </label>
            <Input id={`paidDate-${entryId}`} type="date" name="paidDate" defaultValue={todayISO()} required />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Confirmar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
