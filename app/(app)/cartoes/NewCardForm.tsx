"use client";
import { useActionState, useState } from "react";
import { createCard, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
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

export function NewCardForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCard, {});
  useActionToast(state, { success: "Cartão criado." });

  const [open, setOpen] = useState(false);
  // Fecha o dialog assim que a action retorna sucesso (mesmo padrão do
  // NewCategoryForm/AddEntryForm: ajustar estado durante a renderização, sem
  // useEffect). Como o Radix Dialog desmonta o conteúdo ao fechar, reabrir
  // já apresenta o formulário "resetado".
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Novo cartão</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo cartão</DialogTitle>
          <DialogDescription>Informe nome e cor do cartão.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-name">Nome</Label>
            <Input id="new-card-name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-color">Cor</Label>
            <Input id="new-card-color" name="color" type="color" defaultValue="#3b82f6" className="h-9 w-16 p-1" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-card-closing">Dia de fechamento da fatura (opcional)</Label>
            <Input
              id="new-card-closing"
              name="closingDay"
              type="number"
              min={1}
              max={31}
              placeholder="ex.: 5"
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Compra após o fechamento entra na fatura do mês seguinte.
            </p>
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
