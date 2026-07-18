"use client";
import { useActionState, useState } from "react";
import { deleteEntry, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
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
import { InstallmentDialog } from "./InstallmentDialog";
import { X } from "lucide-react";

/**
 * Ações por linha da tela do Mês: excluir o lançamento (qualquer linha —
 * item fixo, avulso ou parcela individual) e, quando a linha faz parte de
 * um parcelamento (installmentId presente), também editar/excluir o
 * parcelamento inteiro via InstallmentDialog.
 */
export function EntryActions({
  entryId,
  label,
  installmentId,
  plannedCents,
}: {
  entryId: string;
  label: string;
  installmentId: string | null;
  plannedCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteEntry, {});
  useActionToast(state, { success: "Lançamento excluído." });

  const [open, setOpen] = useState(false);
  // Fecha o AlertDialog ao suceder (mesmo padrão do PayCell/CardRow).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {installmentId && (
        <InstallmentDialog installmentId={installmentId} plannedCents={plannedCents} label={label} />
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Excluir lançamento">
            <X />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento &quot;{label}&quot; deste mês será excluído. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={formAction}>
            <input type="hidden" name="entryId" value={entryId} />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
