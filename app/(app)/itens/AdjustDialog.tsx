"use client";
import { useActionState, useState } from "react";
import { TrendingUp } from "lucide-react";
import { saveAdjustment, clearAdjustment, type ActionState } from "./actions";
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
import { useActionToast } from "@/hooks/use-action-toast";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export type AdjustInfo = {
  month: number | null;
  percent: number | null;
  amountCents: number | null;
};

/** Resumo curto da regra (ex.: "+10% em Ago") para exibir na linha do item. */
export function adjustSummary(adjust: AdjustInfo): string | null {
  if (!adjust.month) return null;
  const m = MONTHS[adjust.month - 1]?.slice(0, 3) ?? "";
  if (adjust.percent) return `+${adjust.percent}% em ${m}`;
  if (adjust.amountCents) return `+R$ ${(adjust.amountCents / 100).toFixed(2).replace(".", ",")} em ${m}`;
  return null;
}

export function AdjustDialog({
  itemId,
  itemName,
  adjust,
}: {
  itemId: string;
  itemName: string;
  adjust: AdjustInfo;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveAdjustment, {});
  useActionToast(state, {
    success: (s) =>
      s.count ? `Reajuste salvo e aplicado em ${s.count} lançamento(s) futuro(s).` : "Regra de reajuste salva.",
  });
  const [clearState, clearAction, clearPending] = useActionState<ActionState, FormData>(clearAdjustment, {});
  useActionToast(clearState, { success: "Regra de reajuste removida." });

  const hasRule = adjust.month !== null;
  const [mode, setMode] = useState<"percent" | "amount">(adjust.amountCents ? "amount" : "percent");

  const [open, setOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) setOpen(false);
  }
  const [seenClear, setSeenClear] = useState(clearState);
  if (clearState !== seenClear) {
    setSeenClear(clearState);
    if (clearState.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-sm text-blue-600" aria-label={`Reajuste anual de ${itemName}`}>
          Reajuste
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="size-4" /> Reajuste anual — {itemName}
          </DialogTitle>
          <DialogDescription>
            A cada aniversário (mês escolhido), o valor sobe o percentual (composto) ou o valor
            fixo. &quot;Salvar e aplicar&quot; já reajusta os meses futuros em aberto; &quot;Só
            salvar&quot; vale a partir das próximas cópias de mês.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={itemId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`adjust-month-${itemId}`}>Mês do reajuste</Label>
            <Select name="adjustMonth" required defaultValue={adjust.month ? String(adjust.month) : undefined}>
              <SelectTrigger id={`adjust-month-${itemId}`} className="w-full">
                <SelectValue placeholder="— selecione —" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`adjust-mode-${itemId}`}>Tipo de reajuste</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "percent" | "amount")}>
              <SelectTrigger id={`adjust-mode-${itemId}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentual (%)</SelectItem>
                <SelectItem value="amount">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="mode" value={mode} />
          </div>

          {mode === "percent" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`adjust-percent-${itemId}`}>Percentual por ano</Label>
              <Input
                id={`adjust-percent-${itemId}`}
                name="percentValue"
                type="number"
                step="0.01"
                min="0.01"
                max="500"
                required
                defaultValue={adjust.percent ?? undefined}
                placeholder="Ex.: 10"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`adjust-amount-${itemId}`}>Valor fixo por ano</Label>
              <CurrencyInput
                id={`adjust-amount-${itemId}`}
                name="amountValue"
                defaultCents={adjust.amountCents ?? 0}
              />
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button type="submit" name="apply" value="now" disabled={pending}>
              Salvar e aplicar
            </Button>
            <Button type="submit" variant="outline" disabled={pending}>
              Só salvar
            </Button>
          </DialogFooter>
        </form>

        {hasRule && (
          <form action={clearAction} className="border-t pt-3">
            <input type="hidden" name="id" value={itemId} />
            <Button type="submit" variant="ghost" size="sm" className="text-destructive" disabled={clearPending}>
              Remover regra de reajuste
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
