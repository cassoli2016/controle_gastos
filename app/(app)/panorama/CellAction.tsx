"use client";
import { useActionState, useState } from "react";
import { setEntriesPaid, updateEntryValue, type ActionState } from "../mes/actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActionToast } from "@/hooks/use-action-toast";

export type CellEntry = { id: string; cents: number; paid: boolean };

/**
 * Célula interativa do Panorama: clique abre popover para editar o previsto
 * (célula simples) e dar baixa/desfazer (uma ou todas as ocorrências).
 */
export function CellAction({
  cents,
  remainingCents,
  allPaid,
  paidCount,
  count,
  entries,
  kind,
  income,
  monthLabel,
  line,
}: {
  cents: number;
  /** O que ainda falta na célula — é o valor exibido na matriz. */
  remainingCents: number;
  allPaid: boolean;
  /** Ocorrências já pagas da célula — `0 < paidCount < count` é baixa parcial. */
  paidCount: number;
  count: number;
  entries: CellEntry[];
  kind: "item" | "card" | "loose";
  income: boolean;
  monthLabel: string;
  line: string;
}) {
  const [open, setOpen] = useState(false);

  const [payState, payAction, payPending] = useActionState<ActionState, FormData>(setEntriesPaid, {});
  useActionToast(payState, {
    success: allPaid ? "Baixa desfeita." : income ? "Recebido! 💰" : "Pago! ✅",
  });
  const [valState, valAction, valPending] = useActionState<ActionState, FormData>(updateEntryValue, {});
  useActionToast(valState, { success: "Valor atualizado." });

  // Fecha o popover ao suceder (padrão "adjust state while rendering").
  const [seen, setSeen] = useState({ payState, valState });
  if (payState !== seen.payState || valState !== seen.valState) {
    setSeen({ payState, valState });
    if (payState.ok || valState.ok) setOpen(false);
  }

  const fmt = (c: number) =>
    (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Célula com várias ocorrências (recorrência semanal) pode estar
  // parcialmente paga: âmbar, com a contagem no canto. Nesse estado o botão
  // só dá baixa nas ABERTAS — repagar as pagas sobrescreveria valor e data
  // do pagamento que já aconteceu.
  const partial = paidCount > 0 && !allPaid;
  const payIds = allPaid ? entries.map((e) => e.id) : entries.filter((e) => !e.paid).map((e) => e.id);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full rounded px-1 py-0.5 text-right tabular-nums hover:bg-accent hover:text-foreground ${
            allPaid
              ? "text-emerald-600 dark:text-emerald-400"
              : partial
                ? "text-amber-600 dark:text-amber-400"
                : ""
          }`}
          title={
            allPaid
              ? `Quitado · previsto ${formatCents(cents)}`
              : partial
                ? `Falta ${formatCents(remainingCents)} de ${formatCents(cents)}${count > 1 ? ` · ${paidCount} de ${count} pagas` : ""}`
                : count > 1
                  ? `${count} ocorrências`
                  : undefined
          }
        >
          {fmt(remainingCents)}
          {partial && count > 1 && (
            <span className="ml-0.5 align-super text-[9px] tabular-nums opacity-70">
              {paidCount}/{count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">{line}</p>
            <p className="text-xs text-muted-foreground">
              {monthLabel} ·{" "}
              {allPaid
                ? `${income ? "recebido" : "pago"} · ${formatCents(cents)}`
                : partial
                  ? `falta ${formatCents(remainingCents)} de ${formatCents(cents)}`
                  : formatCents(cents)}
              {count > 1 && ` · ${count} ocorrências`}
              {partial && ` · ${paidCount} ${income ? "recebidas" : "pagas"}`}
            </p>
          </div>

          {kind !== "card" && count === 1 && (
            <form action={valAction} className="flex flex-col gap-1.5">
              <input type="hidden" name="entryId" value={entries[0].id} />
              <Label htmlFor={`cell-amount-${entries[0].id}`}>Previsto</Label>
              <div className="flex items-center gap-2">
                <CurrencyInput id={`cell-amount-${entries[0].id}`} name="amount" defaultCents={cents} />
                <Button type="submit" size="sm" variant="outline" disabled={valPending}>
                  Salvar
                </Button>
              </div>
            </form>
          )}
          {kind === "card" && (
            <p className="text-xs text-muted-foreground">
              Fatura consolidada — o valor vem das compras. Edite pelo &quot;Ver extrato&quot; em Cartões.
            </p>
          )}
          {count > 1 && kind !== "card" && (
            <p className="text-xs text-muted-foreground">
              Valor por ocorrência: edite pelo lápis do grupo na tela do Mês.
            </p>
          )}

          <form action={payAction}>
            <input type="hidden" name="entryIds" value={JSON.stringify(payIds)} />
            <input type="hidden" name="paid" value={(!allPaid).toString()} />
            <Button type="submit" size="sm" className="w-full" variant={allPaid ? "outline" : "default"} disabled={payPending}>
              {allPaid
                ? "Desfazer baixa"
                : income
                  ? payIds.length > 1
                    ? `Receber todas (${payIds.length})`
                    : "Receber"
                  : payIds.length > 1
                    ? `Pagar todas (${payIds.length})`
                    : "Pagar"}
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
