"use client";
import { useActionState, useState } from "react";
import { PiggyBank } from "lucide-react";
import { depositToReserve, type ActionState } from "../reservas/actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { useActionToast } from "@/hooks/use-action-toast";

/**
 * Guarda a sobra do mês sem sair da tela do Mês — o passo que antes obrigava a
 * ir até Reservas depois de dar baixa nas contas.
 *
 * Usa a MESMA action da tela Reservas: o par indivisível (saldo da caixinha +
 * lançamento já pago, na mesma transação) tem um dono só.
 */
export function SaveLeftoverDialog({
  reserves,
  defaultReserveId,
  leftoverCents,
  monthLeftoverCents,
}: {
  reserves: { id: string; name: string }[];
  /** Caixinha do depósito mais recente (lastUsedReserveId). */
  defaultReserveId: string | null;
  /** Quanto ainda dá para guardar: já desconta o que foi para as caixinhas. */
  leftoverCents: number;
  /** Quanto o mês gerou, sem descontar depósito nenhum. */
  monthLeftoverCents: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(depositToReserve, {});
  useActionToast(state, { success: "Guardado na caixinha." });

  const [open, setOpen] = useState(false);
  // Fecha ao sucesso (padrão adjust-state-while-rendering usado no app todo).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  const hasReserves = reserves.length > 0;
  // Por definição das duas métricas, a diferença é o que já foi guardado no mês.
  const alreadySavedCents = monthLeftoverCents - leftoverCents;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <PiggyBank className="size-4" />
          Guardar a sobra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guardar a sobra</DialogTitle>
          <DialogDescription>
            Move o dinheiro para uma caixinha. Sai da conta e entra na reserva — não conta como
            gasto do mês.
          </DialogDescription>
        </DialogHeader>

        {hasReserves ? (
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leftover-reserve">Caixinha</Label>
              <Select name="id" required defaultValue={defaultReserveId ?? undefined}>
                <SelectTrigger id="leftover-reserve" className="w-full">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="leftover-amount">Valor</Label>
                <CurrencyInput
                  id="leftover-amount"
                  name="amount"
                  defaultCents={leftoverCents > 0 ? leftoverCents : 0}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="leftover-date">Data</Label>
                <Input
                  id="leftover-date"
                  type="date"
                  name="date"
                  defaultValue={todayISOInSaoPaulo()}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {leftoverCents > 0
                ? `Sobrou ${formatCents(leftoverCents)} para guardar (o que já foi baixado, entrou menos saiu).${
                    alreadySavedCents > 0 ? ` Você já guardou ${formatCents(alreadySavedCents)} este mês.` : ""
                  } O valor é seu — mude se quiser guardar só parte.`
                : alreadySavedCents > 0
                  ? `Você já guardou ${formatCents(alreadySavedCents)} este mês e a sobra acabou. Dá para guardar mais, mas sai de outro mês.`
                  : "Este mês ainda não tem sobra: o que entrou não passou do que saiu."}
            </p>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma caixinha ainda — crie uma em Reservas para guardar a sobra.
          </p>
        )}
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </DialogContent>
    </Dialog>
  );
}
