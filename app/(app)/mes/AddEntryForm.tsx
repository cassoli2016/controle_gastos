"use client";
import { useActionState, useState } from "react";
import { upsertEntry, type ActionState } from "./actions";
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

export function AddEntryForm({
  month,
  availableItems,
}: {
  month: string;
  availableItems: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(upsertEntry, {});
  useActionToast(state, { success: "Lançamento adicionado." });

  const [open, setOpen] = useState(false);
  // Fecha o dialog assim que a action retorna sucesso (mesmo padrão do
  // PayCell/PlannedCell: ajustar estado durante a renderização). Como o
  // Radix Dialog desmonta o conteúdo ao fechar, reabrir o dialog já
  // apresenta o formulário "resetado" (Select e CurrencyInput remontam).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const hasItems = availableItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Adicionar lançamento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar lançamento</DialogTitle>
          <DialogDescription>
            Escolha um item ativo e informe o valor previsto para este mês.
          </DialogDescription>
        </DialogHeader>

        {hasItems ? (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="month" value={month} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-entry-item">Item</Label>
              {/* O Select do shadcn/Radix renderiza um <select> nativo oculto
                  sincronizado com name="itemId" e required, então participa
                  do FormData de `<form action={formAction}>` e da validação
                  nativa do navegador normalmente (sem precisar de estado
                  controlado aqui). */}
              <Select name="itemId" required>
                <SelectTrigger id="add-entry-item" className="w-full">
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-entry-amount">Valor previsto</Label>
              <CurrencyInput id="add-entry-amount" name="plannedAmount" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Todos os itens ativos já têm lançamento neste mês.
            </p>
            <DialogFooter>
              <Button type="button" disabled>
                Adicionar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
