"use client";
import { useActionState, useState } from "react";
import { createSubscription, cancelSubscription, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { RefreshCw, X } from "lucide-react";

export type SubscriptionView = {
  id: string;
  description: string;
  amountCents: number;
  chargeDay: number;
};

/** Gerencia as assinaturas do cartão (provisionadas nas faturas futuras). */
export function SubscriptionsDialog({
  cardId,
  cardName,
  subscriptions,
}: {
  cardId: string;
  cardName: string;
  subscriptions: SubscriptionView[];
}) {
  const [open, setOpen] = useState(false);

  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(createSubscription, {});
  useActionToast(createState, { success: "Assinatura criada e provisionada." });

  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(cancelSubscription, {});
  useActionToast(cancelState, { success: "Assinatura cancelada — provisões futuras removidas." });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <RefreshCw className="size-4" />
          Assinaturas{subscriptions.length > 0 ? ` (${subscriptions.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assinaturas · {cardName}</DialogTitle>
          <DialogDescription>
            Cobranças mensais do cartão (YouTube, Spotify…) provisionadas nas próximas faturas.
            Quando a cobrança real chega no CSV ou compartilhamento, ela substitui a provisão.
          </DialogDescription>
        </DialogHeader>

        {subscriptions.length > 0 && (
          <ul className="divide-y">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{sub.description}</span>{" "}
                  <span className="text-xs text-muted-foreground">dia {sub.chargeDay}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <span className="tabular-nums">{formatCents(sub.amountCents)}/mês</span>
                  <form action={cancelAction}>
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Cancelar assinatura ${sub.description}`}
                      disabled={cancelPending}
                    >
                      <X />
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}

        <form action={createAction} className="flex flex-col gap-3 border-t pt-3">
          <input type="hidden" name="cardId" value={cardId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sub-desc-${cardId}`}>Descrição</Label>
            <Input id={`sub-desc-${cardId}`} name="description" placeholder="ex.: YouTube Premium" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-amount-${cardId}`}>Valor mensal</Label>
              <CurrencyInput id={`sub-amount-${cardId}`} name="amount" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-day-${cardId}`}>Dia da cobrança</Label>
              <Input id={`sub-day-${cardId}`} name="chargeDay" type="number" min={1} max={31} required />
            </div>
          </div>
          <Button type="submit" disabled={createPending}>
            Adicionar assinatura
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
