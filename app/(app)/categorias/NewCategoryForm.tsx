"use client";
import { useActionState, useState } from "react";
import { createCategory, type ActionState } from "./actions";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionToast } from "@/hooks/use-action-toast";

export function NewCategoryForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCategory, {});
  useActionToast(state, { success: "Categoria criada." });

  const [open, setOpen] = useState(false);
  // Fecha o dialog assim que a action retorna sucesso (mesmo padrão do
  // AddEntryForm/BulkApplyForm: ajustar estado durante a renderização, sem
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
        <Button type="button">Nova categoria</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
          <DialogDescription>Informe nome, tipo e cor da categoria.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-category-name">Nome</Label>
            <Input id="new-category-name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-category-type">Tipo</Label>
            {/* Select do shadcn/Radix: hidden <select> nativo sincronizado
                com name="type" e required, participa do FormData e da
                validação nativa sem precisar de estado controlado aqui. */}
            <Select name="type" defaultValue="EXPENSE" required>
              <SelectTrigger id="new-category-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">Despesa</SelectItem>
                <SelectItem value="INCOME">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-category-color">Cor</Label>
            <Input id="new-category-color" name="color" type="color" defaultValue="#3b82f6" className="h-9 w-16 p-1" />
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
