"use client";
import { useActionState, useState } from "react";
import { updateInstallment, deleteInstallment, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Pencil, Trash2 } from "lucide-react";

/**
 * Ações específicas de um parcelamento (linhas avulsas/cartão com
 * installmentId): editar o valor previsto das parcelas em aberto, ou
 * excluir o parcelamento inteiro. Sempre exibido junto da ação genérica
 * "excluir lançamento" (que afeta só a linha/mês atual) em EntryActions.
 */
export function InstallmentDialog({
  installmentId,
  plannedCents,
  label,
}: {
  installmentId: string;
  plannedCents: number;
  label: string;
}) {
  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(updateInstallment, {});
  useActionToast(editState, {
    success: (s) => `Parcelamento atualizado (${s.count ?? 0} parcela(s) em aberto).`,
  });
  const [editOpen, setEditOpen] = useState(false);
  // Fecha o dialog ao suceder (mesmo padrão do PurchaseDialog/PlannedCell).
  const [seenEditState, setSeenEditState] = useState(editState);
  if (editState !== seenEditState) {
    setSeenEditState(editState);
    if (editState.ok) setEditOpen(false);
  }

  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(deleteInstallment, {});
  useActionToast(deleteState, {
    success: (s) => `Parcelamento excluído (${s.count ?? 0} parcela(s)).`,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [seenDeleteState, setSeenDeleteState] = useState(deleteState);
  if (deleteState !== seenDeleteState) {
    setSeenDeleteState(deleteState);
    if (deleteState.ok) setDeleteOpen(false);
  }

  const fieldId = `installment-amount-${installmentId}`;

  return (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Editar parcelamento">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar parcelamento</DialogTitle>
            <DialogDescription>
              Atualiza o valor previsto das parcelas de &quot;{label}&quot; que ainda estão em aberto (não
              pagas). Parcelas já pagas não são alteradas.
            </DialogDescription>
          </DialogHeader>
          <form action={editAction} className="flex flex-col gap-3">
            <input type="hidden" name="installmentId" value={installmentId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fieldId}>Valor da parcela</Label>
              <CurrencyInput id={fieldId} name="amount" defaultCents={plannedCents} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Excluir parcelamento">
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parcelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as parcelas de &quot;{label}&quot; (pagas ou em aberto) serão excluídas de todos os
              meses. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteAction}>
            <input type="hidden" name="installmentId" value={installmentId} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={deletePending}>
                Excluir parcelamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
