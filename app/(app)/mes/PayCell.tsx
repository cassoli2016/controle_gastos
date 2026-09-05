"use client";
import { useActionState, useState } from "react";
import { markPaid, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Undo2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/** Data já gravada (meia-noite UTC) formatada; sem data, hoje em São Paulo. */
function toDateInputValue(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : todayISOInSaoPaulo();
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function PayCell({
  entryId,
  plannedCents,
  paid,
  paidCents,
  paidDate,
  income = false,
  reserves = [],
  paidFromReserve = null,
  compact = false,
}: {
  entryId: string;
  plannedCents: number;
  paid: boolean;
  paidCents: number | null;
  paidDate: Date | null;
  /** Receita (categoria INCOME): vocabulário "Receber/Recebido" em vez de "Pagar/Pago". */
  income?: boolean;
  /** Caixinhas para pagar "pela caixinha" (só faz sentido em despesas). */
  reserves?: { id: string; name: string }[];
  /** Presente quando ESTA conta foi paga por uma caixinha: desmarcar devolve. */
  paidFromReserve?: { boxName: string; amountCents: number } | null;
  /** Celular: some com o que a linha já diz, para caber em uma linha só. */
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(markPaid, {});
  useActionToast(state, { success: income ? "Recebimento atualizado." : "Pagamento atualizado." });

  const [open, setOpen] = useState(false);
  // Fecha o popover assim que a action retorna sucesso (padrão "adjust state
  // while rendering" do React, evita useEffect + setState em cascata).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }

  if (paid) {
    // No celular o valor pago só aparece quando DIFERE do previsto, que a
    // linha já mostra ao lado — repetir o mesmo número duas vezes era o que
    // fazia a linha quebrar em três.
    const valorDivergente = paidCents !== null && paidCents !== plannedCents;
    const resumo = (
      <>
        {(!compact || valorDivergente) && (
          <span className="font-medium tabular-nums">{paidCents !== null ? formatCents(paidCents) : "—"}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {paidDate ? formatDateBR(toDateInputValue(paidDate)) : ""}
        </span>
      </>
    );

    // Conta paga pela caixinha: o form vive DENTRO do AlertDialogContent (mesmo
    // padrão do CategoryRow). O conteúdo do alert sai num portal — um submit
    // ali fora do form não dispara action nenhuma, e o "Desmarcar e devolver"
    // não fazia nada.
    if (paidFromReserve) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          {resumo}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size={compact ? "icon-sm" : "sm"}
                disabled={pending}
                aria-label={compact ? "Desmarcar" : undefined}
              >
                {compact ? <Undo2 className="size-4" /> : "Desmarcar"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desfazer o pagamento pela caixinha?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta conta foi paga pela caixinha “{paidFromReserve.boxName}”. Desmarcar devolve{" "}
                  {formatCents(paidFromReserve.amountCents)} para ela e apaga a retirada do mês. A
                  conta volta a ficar em aberto.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <form action={formAction}>
                <input type="hidden" name="entryId" value={entryId} />
                <input type="hidden" name="paid" value="false" />
                <AlertDialogFooter>
                  <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
                  <AlertDialogAction type="submit" disabled={pending}>
                    Desmarcar e devolver
                  </AlertDialogAction>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    }

    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="paid" value="false" />
        {resumo}
        <Button
          type="submit"
          variant="ghost"
          size={compact ? "icon-sm" : "sm"}
          disabled={pending}
          aria-label={compact ? "Desmarcar" : undefined}
        >
          {compact ? <Undo2 className="size-4" /> : "Desmarcar"}
        </Button>
      </form>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          {income ? "Receber" : "Pagar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form action={formAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="paid" value="true" />
          <div className="flex flex-col gap-1">
            <label htmlFor={`paidAmount-${entryId}`} className="text-xs text-muted-foreground">
              {income ? "Valor recebido" : "Valor pago"}
            </label>
            <CurrencyInput id={`paidAmount-${entryId}`} name="paidAmount" defaultCents={plannedCents} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`paidDate-${entryId}`} className="text-xs text-muted-foreground">
              {income ? "Data do recebimento" : "Data do pagamento"}
            </label>
            <Input id={`paidDate-${entryId}`} type="date" name="paidDate" defaultValue={todayISOInSaoPaulo()} required />
          </div>
          {!income && reserves.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`reserveId-${entryId}`} className="text-xs text-muted-foreground">
                De onde sai o dinheiro?
              </label>
              <Select name="reserveId" defaultValue="none">
                <SelectTrigger id={`reserveId-${entryId}`} className="w-full">
                  <SelectValue placeholder="Do mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Do mês</SelectItem>
                  {reserves.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Caixinha · {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            Confirmar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
