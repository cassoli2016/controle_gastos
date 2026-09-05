"use client";
import { useActionState, useState } from "react";
import { CheckCheck } from "lucide-react";
import { closeMonth, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
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

/**
 * Fecha o mês mandando o resto para a caixinha (ou tirando dela).
 *
 * Só aparece quando o mês está todo baixado e ainda sobra ou falta alguma
 * coisa — que é justamente quando ele tem o que fazer.
 */
export function CloseMonthDialog({
  month,
  monthLabel,
  residualCents,
  reserves,
  defaultReserveId,
}: {
  month: string;
  /** "agosto de 2026", para a frase soar como a pessoa fala. */
  monthLabel: string;
  /** Positivo sobrou, negativo faltou. */
  residualCents: number;
  reserves: { id: string; name: string }[];
  defaultReserveId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(closeMonth, {});
  const sobrou = residualCents > 0;
  useActionToast(state, {
    success: () =>
      sobrou
        ? `${formatCents(residualCents)} guardados. ${monthLabel} fechou em zero.`
        : `${formatCents(-residualCents)} retirados. ${monthLabel} fechou em zero.`,
  });

  const [open, setOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const hasReserves = reserves.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CheckCheck className="size-4" />
          Fechar o mês
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar {monthLabel}</DialogTitle>
          <DialogDescription>
            Todas as contas do mês já estão baixadas e{" "}
            {sobrou ? (
              <>
                sobraram <strong className="tabular-nums">{formatCents(residualCents)}</strong> na conta.
                Guardar esse resto na caixinha deixa o mês fechado em zero.
              </>
            ) : (
              <>
                faltaram <strong className="tabular-nums">{formatCents(-residualCents)}</strong> na conta.
                Tirar esse valor da caixinha deixa o mês fechado em zero.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasReserves ? (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="month" value={month} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`close-reserve-${month}`}>{sobrou ? "Guardar em" : "Tirar de"}</Label>
              <Select name="reserveId" required defaultValue={defaultReserveId ?? undefined}>
                <SelectTrigger id={`close-reserve-${month}`} className="w-full">
                  <SelectValue placeholder="— selecione —" />
                </SelectTrigger>
                <SelectContent>
                  {reserves.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="alreadyMoved" value="1" className="mt-0.5 size-4" />
              <span>
                O dinheiro já saiu (ou entrou) na conta de verdade
                <span className="block text-xs text-muted-foreground">
                  Marque em mês antigo, quando você já fez a transferência no banco: o movimento
                  entra no extrato e o saldo da caixinha continua o mesmo.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {sobrou ? "Guardar e fechar" : "Tirar e fechar"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma caixinha ainda — crie uma em Reservas para fechar o mês.
          </p>
        )}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </DialogContent>
    </Dialog>
  );
}
