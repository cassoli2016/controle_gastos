"use client";
import { useActionState, useState } from "react";
import { ScrollText, AlertTriangle, Check } from "lucide-react";
import { reconcileReserve, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import type { StatementLine } from "@/lib/reserve-statement";

const KIND_LABEL = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  adjustment: "Ajuste",
} as const;

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Extrato da caixinha: tudo que mexeu no saldo, do mais recente para o mais
 * antigo, com o saldo depois de cada linha — para abrir lado a lado com o app
 * do banco. Embaixo, a conferência: você informa o saldo real e a diferença
 * entra como ajuste.
 */
export function ReserveStatementDialog({
  reserve,
  lines,
  check,
}: {
  reserve: { id: string; name: string; amountCents: number };
  lines: StatementLine[];
  check: { ok: boolean; differenceCents: number };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reconcileReserve, {});
  useActionToast(state, {
    success: (s) =>
      s.count === 0
        ? "Saldo conferido — já estava batendo."
        : `Saldo conferido. Diferença de ${formatCents(Math.abs(s.count ?? 0))} lançada como ajuste.`,
  });

  const [open, setOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Extrato de ${reserve.name}`}>
          <ScrollText className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Extrato de “{reserve.name}”</DialogTitle>
          <DialogDescription>
            Tudo que mexeu no saldo, do mais recente para o mais antigo. Confira lado a lado com o
            app do banco.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
            check.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          {check.ok ? <Check className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
          <span>
            {check.ok ? (
              <>
                O extrato fecha com os <strong className="tabular-nums">{formatCents(reserve.amountCents)}</strong>{" "}
                guardados.
              </>
            ) : (
              <>
                O extrato soma {formatCents(reserve.amountCents - check.differenceCents)}, mas a caixinha
                registra {formatCents(reserve.amountCents)} —{" "}
                <strong className="tabular-nums">{formatCents(Math.abs(check.differenceCents))}</strong> sem
                explicação.
              </>
            )}
          </span>
        </div>

        {lines.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum movimento ainda. Depósitos, retiradas e ajustes aparecem aqui.
          </p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {lines.map((l, i) => (
              <li key={`${l.dateISO}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{l.label}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatDateBR(l.dateISO)} · {KIND_LABEL[l.kind]}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      l.deltaCents < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {l.deltaCents < 0 ? "−" : "+"}
                    {formatCents(Math.abs(l.deltaCents))}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    saldo {formatCents(l.balanceCents)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} className="flex flex-col gap-2 border-t pt-3">
          <input type="hidden" name="id" value={reserve.id} />
          <Label htmlFor={`reconcile-${reserve.id}`}>Conferir com o saldo real</Label>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <CurrencyInput
                id={`reconcile-${reserve.id}`}
                name="realAmount"
                defaultCents={reserve.amountCents}
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              Conferir
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Digite o que a aplicação mostra hoje. Se houver diferença, ela entra como ajuste com a data
            de hoje — e você passa a ver quanto rendeu de uma conferência para a outra.
          </p>
        </form>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </DialogContent>
    </Dialog>
  );
}
