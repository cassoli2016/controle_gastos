"use client";
import { useActionState, useState } from "react";
import { deleteEntry, deleteRecurringForward, makeRecurring, type ActionState } from "./actions";
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
import { X, Repeat } from "lucide-react";

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
  canRecur = false,
  isRecurring = false,
}: {
  entryId: string;
  label: string;
  installmentId: string | null;
  plannedCents: number;
  /** Avulso sem cartão e sem item: pode virar recorrência mensal (conta fixa). */
  canRecur?: boolean;
  /** Lançamento de conta recorrente (item): excluir pergunta se encerra os futuros. */
  isRecurring?: boolean;
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

  const [endState, endAction, endPending] = useActionState<ActionState, FormData>(deleteRecurringForward, {});
  useActionToast(endState, {
    success: (st) => `Recorrência encerrada (${st.count ?? 0} lançamentos excluídos).`,
  });
  const [seenEndState, setSeenEndState] = useState(endState);
  if (endState !== seenEndState) {
    setSeenEndState(endState);
    if (endState.ok) setOpen(false);
  }

  const [recurState, recurAction, recurPending] = useActionState<ActionState, FormData>(makeRecurring, {});
  useActionToast(recurState, {
    success: (st) => `Recorrência criada (${st.count ?? 0} meses). Edite em Itens.`,
  });
  const [recurOpen, setRecurOpen] = useState(false);
  const [seenRecurState, setSeenRecurState] = useState(recurState);
  if (recurState !== seenRecurState) {
    setSeenRecurState(recurState);
    if (recurState.ok) setRecurOpen(false);
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {canRecur && (
        <AlertDialog open={recurOpen} onOpenChange={setRecurOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Tornar recorrente">
              <Repeat />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tornar recorrência mensal?</AlertDialogTitle>
              <AlertDialogDescription>
                &quot;{label}&quot; vira uma conta fixa com o mesmo valor, provisionada nos
                próximos 12 meses (ajuste valor e reajuste anual em Itens).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={recurAction}>
              <input type="hidden" name="entryId" value={entryId} />
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                <AlertDialogAction type="submit" disabled={recurPending}>
                  Tornar recorrente
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
            <AlertDialogTitle>{isRecurring ? "Excluir lançamento recorrente?" : "Excluir lançamento?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurring ? (
                <>
                  &quot;{label}&quot; é uma conta recorrente. Você pode excluir só o lançamento
                  deste mês (os demais ficam) ou encerrar a recorrência — excluindo este e
                  TODOS os meses futuros. Esta ação não pode ser desfeita.
                </>
              ) : (
                <>O lançamento &quot;{label}&quot; deste mês será excluído. Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isRecurring ? (
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch sm:justify-stretch sm:space-x-0">
              <form action={formAction} className="contents">
                <input type="hidden" name="entryId" value={entryId} />
                <Button type="submit" variant="outline" disabled={pending || endPending}>
                  Excluir só este mês
                </Button>
              </form>
              <form action={endAction} className="contents">
                <input type="hidden" name="entryId" value={entryId} />
                <Button type="submit" variant="destructive" disabled={pending || endPending}>
                  Excluir este e todos os futuros
                </Button>
              </form>
              <AlertDialogCancel type="button" className="mt-0">Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="entryId" value={entryId} />
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
