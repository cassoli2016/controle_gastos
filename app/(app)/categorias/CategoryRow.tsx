"use client";
import { useActionState, useState } from "react";
import { updateCategory, deleteCategory, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionToast } from "@/hooks/use-action-toast";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
};

export function CategoryRow({ category }: { category: Category }) {
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(updateCategory, {});
  useActionToast(updateState, { success: "Categoria atualizada." });

  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteCategory, {});
  useActionToast(deleteState, { success: "Categoria excluída." });

  const [editOpen, setEditOpen] = useState(false);
  // Fecha o dialog de edição assim que a action retorna sucesso (mesmo
  // padrão do NewCategoryForm/AddEntryForm: ajustar estado durante a
  // renderização, sem useEffect).
  const [seenUpdateState, setSeenUpdateState] = useState(updateState);
  if (updateState !== seenUpdateState) {
    setSeenUpdateState(updateState);
    if (updateState.ok) setEditOpen(false);
  }

  const [deleteOpen, setDeleteOpen] = useState(false);
  // Mesmo padrão: fecha o AlertDialog de confirmação ao suceder. Em caso de
  // erro (categoria em uso) o AlertDialog permanece aberto e o toast de erro
  // aparece via useActionToast, para o usuário ver o motivo sem perder o
  // contexto de confirmação.
  const [seenDeleteState, setSeenDeleteState] = useState(deleteState);
  if (deleteState !== seenDeleteState) {
    setSeenDeleteState(deleteState);
    if (deleteState.ok) setDeleteOpen(false);
  }

  const typeBadge = (
    <Badge variant={category.type === "INCOME" ? "default" : "secondary"}>
      {category.type === "INCOME" ? "Receita" : "Despesa"}
    </Badge>
  );

  const colorChip = (
    <span
      className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
      style={{ background: category.color }}
      aria-hidden
    />
  );

  // Um único par Dialog/AlertDialog (estado controlado, single instance),
  // com DOIS gatilhos cada (um para a linha desktop, outro para o mini-card
  // mobile) — em vez de duplicar Dialog/AlertDialog inteiros nas duas
  // variantes. Root do Radix (Dialog/AlertDialog) não renderiza elemento DOM
  // próprio (é só um provider de contexto), então aninhar as <TableRow> como
  // filhas dele não quebra a estrutura da tabela; e como só existe UM
  // DialogContent/AlertDialogContent (portal único), abrir pela linha visível
  // em qualquer breakpoint não duplica formulário nem sobrepõe dois modais.
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        {/* Desktop: linha de tabela (shadcn Table) */}
        <TableRow className="hidden md:table-row">
          <TableCell>
            <div className="flex items-center gap-2">
              {colorChip}
              <span className="font-medium">{category.name}</span>
            </div>
          </TableCell>
          <TableCell>{typeBadge}</TableCell>
          <TableCell>
            <div className="flex items-center justify-end gap-2">
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Editar
                </Button>
              </DialogTrigger>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  Excluir
                </Button>
              </AlertDialogTrigger>
            </div>
          </TableCell>
        </TableRow>

        {/* Mobile: mini-card empilhado numa única célula */}
        <TableRow className="md:hidden">
          <TableCell colSpan={3} className="p-0">
            <div className="flex flex-col gap-2 p-3 whitespace-normal">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {colorChip}
                  <span className="font-medium">{category.name}</span>
                </div>
                {typeBadge}
              </div>
              <div className="flex items-center gap-2">
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Editar
                  </Button>
                </DialogTrigger>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm">
                    Excluir
                  </Button>
                </AlertDialogTrigger>
              </div>
            </div>
          </TableCell>
        </TableRow>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar categoria</DialogTitle>
            <DialogDescription>Altere nome, tipo ou cor da categoria.</DialogDescription>
          </DialogHeader>

          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={category.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-name-${category.id}`}>Nome</Label>
              <Input id={`edit-category-name-${category.id}`} name="name" defaultValue={category.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-type-${category.id}`}>Tipo</Label>
              <Select name="type" defaultValue={category.type} required>
                <SelectTrigger id={`edit-category-type-${category.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="INCOME">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-category-color-${category.id}`}>Cor</Label>
              <Input
                id={`edit-category-color-${category.id}`}
                name="color"
                type="color"
                defaultValue={category.color}
                className="h-9 w-16 p-1"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updatePending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A categoria &quot;{category.name}&quot; será excluída
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={category.id} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={deletePending}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
