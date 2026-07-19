"use client";
import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createItem, type ActionState } from "./actions";
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

export function NewItemForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItem, {});
  useActionToast(state, { success: "Item criado." });

  const [open, setOpen] = useState(false);
  // Fecha o dialog assim que a action retorna sucesso (mesmo padrão do
  // NewCardForm/NewCategoryForm: ajustar estado durante a renderização, sem
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
        <Button type="button">
          <Plus className="size-4" />
          Novo item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo item</DialogTitle>
          <DialogDescription>Informe nome, categoria e, se quiser, o dia de vencimento.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          {/* Itens novos sempre nascem ATIVOS: input hidden explícito. O
              parseItem() em actions.ts calcula `active` pela PRESENÇA da
              chave "active" no FormData (`formData.get("active") !== null`),
              não pelo seu valor — sem este campo, o item nasceria arquivado
              (bug histórico já corrigido; não regredir). */}
          <input type="hidden" name="active" value="true" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-name">Nome</Label>
            <Input id="new-item-name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-category">Categoria</Label>
            {/* O Select do shadcn/Radix renderiza um <select> nativo oculto
                sincronizado com name="categoryId" e required, então participa
                do FormData de `<form action={formAction}>` e da validação
                nativa do navegador normalmente (sem precisar de estado
                controlado aqui). */}
            <Select name="categoryId" required>
              <SelectTrigger id="new-item-category" className="w-full">
                <SelectValue placeholder="— selecione —" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-item-due-day">Dia de vencimento</Label>
            <Input id="new-item-due-day" name="dueDay" type="number" min={1} max={31} placeholder="Opcional" />
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
