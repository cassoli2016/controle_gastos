"use client";
import { useActionState, useState } from "react";
import { Pencil, Trash2, Plus, Minus, TriangleAlert } from "lucide-react";
import {
  updateReserve,
  deleteReserve,
  depositToReserve,
  withdrawFromReserve,
  type ActionState,
} from "./actions";
import { formatCents } from "@/lib/money";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Money } from "@/components/Money";
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
import { goalProgress, goalSentence } from "@/lib/reserve-goal";
import { shortMonthLabel } from "@/lib/matrix";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function ReserveCard({
  reserve,
  totalCents,
  currentMonth,
  leftoverCents,
  statement,
}: {
  reserve: { id: string; name: string; amountCents: number; goalCents: number | null; goalMonth: string | null };
  /** Soma de todas as caixinhas: a fatia desta aparece no card. */
  totalCents: number;
  /** "YYYY-MM" de hoje: base do ritmo por mês da meta. */
  currentMonth: string;
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

  const share = totalCents > 0 ? Math.round((reserve.amountCents / totalCents) * 100) : null;
  const goal =
    reserve.goalCents !== null && reserve.goalCents > 0
      ? goalProgress(reserve.amountCents, reserve.goalCents, reserve.goalMonth, currentMonth)
      : null;
  // O extrato vem do mais recente para o mais antigo.
  const last = statement.lines[0] ?? null;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-snug break-words">{reserve.name}</div>
            <Money
              cents={reserve.amountCents}
              tabular={false}
              className="text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
            />
          </div>
          {share !== null && (
            <div className="shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
              <span className="text-sm font-medium tabular-nums text-foreground">{share}%</span>
              <span className="block">do guardado</span>
            </div>
          )}
        </div>

        {/* A meta: barra, valor-alvo e o ritmo para chegar lá. */}
        {goal && reserve.goalCents !== null && (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                Meta <Money cents={reserve.goalCents} className="font-medium text-foreground" />
                {reserve.goalMonth && <span> até {shortMonthLabel(reserve.goalMonth)}</span>}
              </span>
              <span className={cn("tabular-nums", goal.reached ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {goal.pct}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${goal.pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {goalSentence(goal, reserve.goalMonth ? shortMonthLabel(reserve.goalMonth) : null)}
            </p>
          </div>
        )}

        {/* O último movimento é o que diz se a caixinha está viva; o extrato
            inteiro fica atrás do botão. */}
        {last ? (
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              <span className="tabular-nums">{shortDate(last.dateISO)}</span> · {last.label}
            </span>
            <Money
              cents={last.deltaCents}
              className={cn("shrink-0 font-medium", last.deltaCents < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem movimentos registrados.</p>
        )}
        {!statement.check.ok && statement.lines.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            O extrato não bate com o saldo: diferença de {formatCents(statement.check.differenceCents)}.
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 border-t pt-3">
          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus className="size-4" />
                Depositar
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
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="alreadyMoved" value="1" className="mt-0.5 size-4" />
                  <span>
                    O dinheiro já está na caixinha
                    <span className="block text-xs text-muted-foreground">
                      Marque quando você já fez a transferência no banco e já atualizou o saldo da
                      caixinha: o depósito entra no extrato e o saldo continua o mesmo.
                    </span>
                  </span>
                </label>
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
              <Button type="button" variant="outline" size="sm">
                <Minus className="size-4" />
                Retirar
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

          <span className="ml-auto flex items-center gap-0.5">
            <ReserveStatementDialog reserve={reserve} lines={statement.lines} check={statement.check} />

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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`reserve-goal-${reserve.id}`}>Meta (opcional)</Label>
                      <CurrencyInput id={`reserve-goal-${reserve.id}`} name="goalAmount" defaultCents={reserve.goalCents ?? 0} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`reserve-goal-month-${reserve.id}`}>Até (opcional)</Label>
                      <Input id={`reserve-goal-month-${reserve.id}`} name="goalMonth" type="month" defaultValue={reserve.goalMonth ?? ""} />
                    </div>
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
                    <AlertDialogAction type="submit" variant="destructive" disabled={deletePending}>
                      Excluir
                    </AlertDialogAction>
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
