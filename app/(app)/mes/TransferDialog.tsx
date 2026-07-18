"use client";
import { useActionState, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { transferValue, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionToast } from "@/hooks/use-action-toast";

export type TransferOption = { id: string; label: string; plannedCents: number };

/**
 * Move valor entre dois lançamentos do mês exibido — o fluxo diário de
 * "tirar da provisão (ex.: ALMOÇO) e somar no cartão".
 */
export function TransferDialog({ entries }: { entries: TransferOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transferValue, {});
  useActionToast(state, { success: "Valor transferido." });

  const [open, setOpen] = useState(false);
  // Fecha ao sucesso (padrão adjust-state-while-rendering usado no app todo).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const canTransfer = entries.length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ArrowLeftRight data-icon="inline-start" className="size-4" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir valor</DialogTitle>
          <DialogDescription>
            Tira o valor de um lançamento e soma em outro, no mesmo mês. Ex.: baixar a provisão de
            almoço e somar no cartão.
          </DialogDescription>
        </DialogHeader>

        {canTransfer ? (
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-source">De (origem)</Label>
              <Select name="sourceEntryId" required>
                <SelectTrigger id="transfer-source" className="w-full">
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label} · {formatCents(e.plannedCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-amount">Valor</Label>
              <CurrencyInput id="transfer-amount" name="amount" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-target">Para (destino)</Label>
              <Select name="targetEntryId" required>
                <SelectTrigger id="transfer-target" className="w-full">
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.label} · {formatCents(e.plannedCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Transferir
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            É preciso ter pelo menos dois lançamentos no mês para transferir.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
