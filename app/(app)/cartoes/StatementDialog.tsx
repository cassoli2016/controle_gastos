"use client";
import { useActionState, useState } from "react";
import { updateStatementLine, deleteStatementLine, type ActionState } from "./actions";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { ReceiptText, Pencil, X } from "lucide-react";

export type StatementRowView = {
  id: string;
  description: string;
  amountCents: number;
  /** dd/mm da compra (já formatado no servidor) ou null. */
  dateLabel: string | null;
  installmentSeq: number | null;
  installmentCount: number | null;
  prepayment: boolean;
  /** Provisão de assinatura (ainda não cobrada). */
  subscription: boolean;
};

/** Form de edição de UMA linha (aparece abaixo da linha ao clicar no lápis). */
function EditLineForm({
  row,
  monthISO,
  onClose,
}: {
  row: StatementRowView;
  monthISO: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateStatementLine, {});
  useActionToast(state, { success: "Lançamento atualizado — fatura recalculada." });
  const [delState, delAction, delPending] = useActionState<ActionState, FormData>(deleteStatementLine, {});
  useActionToast(delState, { success: "Lançamento excluído — fatura recalculada." });

  // Fecha o form ao suceder (padrão "adjust state while rendering").
  const [seen, setSeen] = useState({ state, delState });
  if (state !== seen.state || delState !== seen.delState) {
    setSeen({ state, delState });
    if (state.ok || delState.ok) onClose();
  }

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <form action={formAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="txId" value={row.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`line-desc-${row.id}`}>Descrição</Label>
          <Input id={`line-desc-${row.id}`} name="description" defaultValue={row.description} required />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`line-amount-${row.id}`}>Valor (R$; negativo = estorno)</Label>
            <Input
              id={`line-amount-${row.id}`}
              name="amount"
              type="number"
              step="0.01"
              defaultValue={(row.amountCents / 100).toFixed(2)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`line-month-${row.id}`}>Fatura</Label>
            <Input id={`line-month-${row.id}`} name="month" type="month" defaultValue={monthISO} required />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Mudar a fatura MOVE o lançamento: o valor sai deste mês e entra no escolhido.
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button
            type="submit"
            formAction={delAction}
            variant="destructive"
            size="sm"
            disabled={pending || delPending}
          >
            Excluir
          </Button>
          <span className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending || delPending}>
              Salvar
            </Button>
          </span>
        </div>
      </form>
    </div>
  );
}

/** Modal com o extrato detalhado da fatura do cartão no mês. */
export function StatementDialog({
  cardName,
  monthLabel,
  monthISO,
  totalCents,
  rows,
}: {
  cardName: string;
  monthLabel: string;
  /** Competência da fatura (YYYY-MM) — usada na edição/movimentação. */
  monthISO: string;
  totalCents: number;
  rows: StatementRowView[];
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setEditingId(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={rows.length === 0}>
          <ReceiptText className="size-4" />
          Ver extrato{rows.length > 0 ? ` (${rows.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Extrato {cardName} · {monthLabel}
          </DialogTitle>
          <DialogDescription>
            {rows.length} lançamento(s) — total da fatura {formatCents(totalCents)}. Use o lápis
            para editar, mover de fatura ou excluir.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y overflow-y-auto pr-1 -mr-1">
          {rows.map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {row.dateLabel && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">{row.dateLabel}</span>
                  )}
                  <span className="truncate">{row.description}</span>
                  {(row.installmentCount ?? 0) > 1 && (
                    <Badge variant="secondary" className="shrink-0">
                      {row.installmentSeq}/{row.installmentCount}
                    </Badge>
                  )}
                  {row.prepayment && (
                    <Badge variant="outline" className="shrink-0 text-emerald-600 dark:text-emerald-400">
                      Antecipação
                    </Badge>
                  )}
                  {row.subscription && (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">
                      Assinatura
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <span
                    className={`tabular-nums ${row.amountCents < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                  >
                    {formatCents(row.amountCents)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${row.description}`}
                    onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                  >
                    {editingId === row.id ? <X /> : <Pencil />}
                  </Button>
                </span>
              </div>
              {editingId === row.id && (
                <div className="mt-2">
                  <EditLineForm row={row} monthISO={monthISO} onClose={() => setEditingId(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
