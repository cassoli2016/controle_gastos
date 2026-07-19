"use client";
import { useActionState, useState } from "react";
import { registerPrepayment, type ActionState } from "./actions";
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
import { HandCoins } from "lucide-react";

/** Registra um pagamento antecipado de fatura (abate o consolidado do mês). */
export function PrepaymentDialog({ cardId, cardName }: { cardId: string; cardName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerPrepayment, {});
  useActionToast(state, { success: "Pagamento antecipado registrado." });

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
        <Button type="button" variant="outline" size="sm">
          <HandCoins className="size-4" />
          Antecipar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Antecipar pagamento · {cardName}</DialogTitle>
          <DialogDescription>
            O valor é abatido da fatura em aberto (a data + dia de fechamento definem o mês) e
            aparece no extrato como &quot;Pagamento antecipado&quot;.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="cardId" value={cardId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`prepay-amount-${cardId}`}>Valor antecipado</Label>
            <CurrencyInput id={`prepay-amount-${cardId}`} name="amount" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`prepay-date-${cardId}`}>Data do pagamento</Label>
            <Input
              id={`prepay-date-${cardId}`}
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
