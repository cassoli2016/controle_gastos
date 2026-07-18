"use client";
import { useActionState, useState } from "react";
import { applyRange, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function BulkApplyForm({
  items,
  defaultMonth,
}: {
  items: { id: string; name: string }[];
  defaultMonth: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(applyRange, {});
  useActionToast(state, { success: (s) => `Aplicado em ${s.count ?? 0} meses.` });

  const [open, setOpen] = useState(false);
  // Mesmo padrão do PayCell/PlannedCell/AddEntryForm: fecha o dialog ao
  // detectar sucesso durante a renderização; reabrir remonta o formulário.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Aplicar em lote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar valor em lote</DialogTitle>
          <DialogDescription>
            Define o mesmo valor previsto para um item em um intervalo de meses.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-apply-item">Item</Label>
            {/* Select do shadcn/Radix: hidden <select> nativo sincronizado
                com name="itemId" e required, participa do FormData e da
                validação nativa sem precisar de estado controlado aqui. */}
            <Select name="itemId" required>
              <SelectTrigger id="bulk-apply-item" className="w-full">
                <SelectValue placeholder="— selecione —" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-apply-from">De</Label>
              <Input id="bulk-apply-from" type="month" name="from" defaultValue={defaultMonth} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-apply-to">Até</Label>
              <Input id="bulk-apply-to" type="month" name="to" defaultValue={defaultMonth} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-apply-amount">Valor</Label>
            <CurrencyInput id="bulk-apply-amount" name="amount" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Aplicar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
