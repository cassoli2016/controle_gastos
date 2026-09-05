"use client";
import { useActionState, useState } from "react";
import { PiggyBank, Pencil, Trash2, Plus, Minus } from "lucide-react";
import {
  updateReserve,
  deleteReserve,
  depositToReserve,
  withdrawFromReserve,
  type ActionState,
} from "./actions";
import { formatCents } from "@/lib/money";
import { todayISOInSaoPaulo } from "@/lib/fatura";
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
import { ReserveStatementDialog } from "./ReserveStatementDialog";
import type { StatementLine } from "@/lib/reserve-statement";

export function ReserveCard({
  reserve,
  leftoverCents,
  statement,
}: {
  reserve: { id: string; name: string; amountCents: number };
  /** Sobra realizada do mês: informação para você decidir quanto guardar. */
  leftoverCents: number;
  /** Extrato e a checagem contra o saldo registrado (lib/reserve-statement). */
  statement: { lines: StatementLine[]; check: { ok: boolean; differenceCents: number } };
}) {
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

  const [depositState, depositAction, depositPending] = useActionState<ActionState, FormData>(depositToReserve, {});
  useActionToast(depositState, { success: "Depósito registrado." });
  const [depositOpen, setDepositOpen] = useState(false);
  const [seenDeposit, setSeenDeposit] = useState(depositState);
  if (depositState !== seenDeposit) {
    setSeenDeposit(depositState);
    if (depositState.ok) setDepositOpen(false);
  }

  const [withdrawState, withdrawAction, withdrawPending] = useActionState<ActionState, FormData>(
    withdrawFromReserve,
    {},
  );
  useActionToast(withdrawState, { success: "Retirada registrada." });
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [seenWithdraw, setSeenWithdraw] = useState(withdrawState);
  if (withdrawState !== seenWithdraw) {
    setSeenWithdraw(withdrawState);
    if (withdrawState.ok) setWithdrawOpen(false);
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
          <ReserveStatementDialog reserve={reserve} lines={statement.lines} check={statement.check} />

          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Depositar em ${reserve.name}`}>
                <Plus className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Depositar em “{reserve.name}”</DialogTitle>
                <DialogDescription>
                  O valor soma na caixinha e entra como despesa paga (“Reserva”) no mês da data — assim o
                  dinheiro não conta duas vezes.
                </DialogDescription>
              </DialogHeader>
              <form action={depositAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={reserve.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-deposit-amount-${reserve.id}`}>Valor</Label>
                  <CurrencyInput
                    id={`reserve-deposit-amount-${reserve.id}`}
                    name="amount"
                    defaultCents={leftoverCents > 0 ? leftoverCents : 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    {leftoverCents > 0
                      ? `Sobrou ${formatCents(leftoverCents)} este mês (entrou menos saiu, só o que já foi baixado). O valor é seu — mude se quiser guardar só parte.`
                      : "Este mês ainda não tem sobra: o que entrou não passou do que saiu."}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-deposit-date-${reserve.id}`}>Data</Label>
                  <Input
                    id={`reserve-deposit-date-${reserve.id}`}
                    type="date"
                    name="date"
                    defaultValue={todayISOInSaoPaulo()}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={depositPending}>
                    Depositar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Retirar de ${reserve.name}`}>
                <Minus className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Retirar de “{reserve.name}”</DialogTitle>
                <DialogDescription>
                  O valor sai da caixinha e entra como receita recebida (“Retirada da reserva”) no mês
                  da data — o dinheiro volta a contar no mês, uma vez só.
                </DialogDescription>
              </DialogHeader>
              <form action={withdrawAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={reserve.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-withdraw-amount-${reserve.id}`}>Valor</Label>
                  <CurrencyInput
                    id={`reserve-withdraw-amount-${reserve.id}`}
                    name="amount"
                    defaultCents={0}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-withdraw-date-${reserve.id}`}>Data</Label>
                  <Input
                    id={`reserve-withdraw-date-${reserve.id}`}
                    type="date"
                    name="date"
                    defaultValue={todayISOInSaoPaulo()}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={withdrawPending}>
                    Retirar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`reserve-reason-${reserve.id}`}>Motivo da mudança</Label>
                  <Input
                    id={`reserve-reason-${reserve.id}`}
                    name="reason"
                    placeholder="ex.: rendimento do mês"
                    maxLength={80}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mudar o valor cria uma linha no extrato com a diferença. Em branco, fica
                    &ldquo;Ajuste manual&rdquo;.
                  </p>
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
