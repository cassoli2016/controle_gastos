"use client";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createReserve, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
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
import { useActionToast } from "@/hooks/use-action-toast";

export function NewReserveForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createReserve, {});
  useActionToast(state, { success: "Caixinha criada." });

  const [open, setOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus data-icon="inline-start" className="size-4" />
          Nova caixinha
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova caixinha</DialogTitle>
          <DialogDescription>
            Uma reserva com nome e valor guardado — ex.: &quot;Emergência&quot;, &quot;IPVA 2027&quot;.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-reserve-name">Nome</Label>
            <Input id="new-reserve-name" name="name" required placeholder="Ex.: Emergência" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-reserve-amount">Valor guardado</Label>
            <CurrencyInput id="new-reserve-amount" name="amount" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
