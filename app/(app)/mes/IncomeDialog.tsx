"use client";
import { useActionState, useState } from "react";
import { createIncome, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { TrendingUp } from "lucide-react";

/** Lança um recebimento (salário, freela, dividendos…) — categoria Recebimentos. */
export function IncomeDialog() {
  const [recurring, setRecurring] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createIncome, {});
  useActionToast(state, {
    success: (s) =>
      recurring ? `Recebimento mensal criado (${s.count ?? 0} meses provisionados).` : "Recebimento lançado.",
  });

  const [open, setOpen] = useState(false);
  // Fecha o dialog ao suceder (padrão "adjust state while rendering").
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <TrendingUp className="size-4" />
          Lançar recebimento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar recebimento</DialogTitle>
          <DialogDescription>
            Salário, freela, dividendos… Entra na categoria Recebimentos (Receita) e aparece
            com o botão &quot;Receber&quot; no mês.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="income-description">Descrição</Label>
            <Input id="income-description" name="description" placeholder="ex.: Salário" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income-amount">{recurring ? "Valor mensal" : "Valor"}</Label>
              <CurrencyInput id="income-amount" name="amount" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income-date">Data</Label>
              <Input
                id="income-date"
                type="date"
                name="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="recurring"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="size-4 accent-primary"
            />
            Recorrência mensal (salário — provisiona os próximos 12 meses)
          </label>
          {recurring && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="fifthBusinessDay" className="size-4 accent-primary" />
              Recebo no 5º dia útil (a data varia mês a mês)
            </label>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
