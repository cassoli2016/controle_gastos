"use client";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReceiptText } from "lucide-react";

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

/** Modal com o extrato detalhado da fatura do cartão no mês. */
export function StatementDialog({
  cardName,
  monthLabel,
  totalCents,
  rows,
}: {
  cardName: string;
  monthLabel: string;
  totalCents: number;
  rows: StatementRowView[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            {rows.length} lançamento(s) — total da fatura {formatCents(totalCents)}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y overflow-y-auto pr-1 -mr-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
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
              <span
                className={`tabular-nums shrink-0 ${row.amountCents < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}
              >
                {formatCents(row.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
