"use client";
import { useActionState, useState } from "react";
import { PiggyBank, Pencil, Trash2 } from "lucide-react";
import { updateReserve, deleteReserve, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useActionToast } from "@/hooks/use-action-toast";

export function ReserveCard({ reserve }: { reserve: { id: string; name: string; amountCents: number } }) {
  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateReserve, {});
  useActionToast(editState, { success: "Caixinha atualizada." });
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteReserve, {});
  useActionToast(deleteState, { success: "Caixinha excluída." });

  const [editOpen, setEditOpen] = useState(false);
  const [seenEdit, setSeenEdit] = useState(editState);
  if (editState !== seenEdit) {
    setSeenEdit(editState);
    if (editState.ok) setEditOpen(false);
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <PiggyBank className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{reserve.name}</div>
          <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCents(reserve.amountCents)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${reserve.name}`}>
                <Pencil className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar caixinha</DialogTitle>
                <DialogDescription>Ajuste o nome ou o valor guardado.</DialogDescription>
              </DialogHeader>
              <form action={editAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={reserve.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-name-${reserve.id}`}>Nome</Label>
                  <Input id={`reserve-name-${reserve.id}`} name="name" defaultValue={reserve.name} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-amount-${reserve.id}`}>Valor guardado</Label>
                  <CurrencyInput id={`reserve-amount-${reserve.id}`} name="amount" defaultCents={reserve.amountCents} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={editPending}>
                    Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${reserve.name}`}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir “{reserve.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  A caixinha ({formatCents(reserve.amountCents)}) será removida. Isso não altera seus
                  lançamentos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={reserve.id} />
                  <AlertDialogAction type="submit" disabled={deletePending}>
                    Excluir
                  </AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
