"use client";
import { useActionState, useState } from "react";
import {
  createSubscription,
  cancelSubscription,
  updateSubscriptionBankDescription,
  type ActionState,
} from "./actions";
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
  /** Como o estabelecimento sai na fatura; null = casa pelo nome. */
  bankDescription: string | null;
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
  useActionToast(cancelState, { success: "Assinatura desativada — as linhas do mês ficam." });

  const [bankState, bankAction, bankPending] = useActionState<ActionState, FormData>(
    updateSubscriptionBankDescription,
    {},
  );
  useActionToast(bankState, { success: "Nome da fatura salvo." });

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
            Cada assinatura vira uma linha própria no mês (fora do total do cartão), pela
            duração escolhida. Quando a cobrança chega na fatura, a linha é marcada como paga
            automaticamente — o valor passa a contar dentro do cartão.
          </DialogDescription>
        </DialogHeader>

        {subscriptions.length > 0 && (
          <ul className="divide-y">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="flex flex-col gap-1.5 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
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
                </div>
                {/* Editável aqui porque o nome exato só aparece quando a primeira
                    cobrança chega — e sem ele a conta conta duas vezes. */}
                <form action={bankAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="subscriptionId" value={sub.id} />
                  <Input
                    name="bankDescription"
                    defaultValue={sub.bankDescription ?? ""}
                    placeholder="Como aparece na fatura (ex.: Google Youtubepremium)"
                    className="h-7 text-xs"
                    aria-label={`Nome na fatura de ${sub.description}`}
                  />
                  <Button type="submit" variant="outline" size="sm" disabled={bankPending}>
                    Salvar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={createAction} className="flex flex-col gap-3 border-t pt-3">
          <input type="hidden" name="cardId" value={cardId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sub-desc-${cardId}`}>Nome</Label>
            <Input id={`sub-desc-${cardId}`} name="description" placeholder="ex.: YouTube Premium" required />
            <p className="text-xs text-muted-foreground">É o que aparece na tela do Mês.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sub-bank-${cardId}`}>Como aparece na fatura</Label>
            <Input id={`sub-bank-${cardId}`} name="bankDescription" placeholder="ex.: Google Youtubepremium" />
            <p className="text-xs text-muted-foreground">
              Opcional. Preencha quando o nome do banco for diferente — é por ele que a cobrança é reconhecida e a
              conta deixa de contar duas vezes.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-amount-${cardId}`}>Valor mensal</Label>
              <CurrencyInput id={`sub-amount-${cardId}`} name="amount" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-day-${cardId}`}>Dia da cobrança</Label>
              <Input id={`sub-day-${cardId}`} name="chargeDay" type="number" min={1} max={31} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sub-months-${cardId}`}>Duração (meses)</Label>
              <Input id={`sub-months-${cardId}`} name="months" type="number" min={1} max={120} defaultValue={12} required />
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
