"use client";
import { useActionState, useState } from "react";
import {
  previewFatura,
  applyFatura,
  type FaturaPreview,
  type FaturaPreviewState,
  type FaturaApplyState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast } from "@/hooks/use-action-toast";
import { formatCents } from "@/lib/money";
import { monthToDate, formatCompetencia } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FileUp } from "lucide-react";

/** "2026-11-21" → "21/11/26" (curto, cabe na tabela do preview). */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Importa a fatura PDF (Nubank ou Bradesco): upload → preview validado com descrições
 * editáveis (apelidos) → aplicação (replace do mês + meses futuros).
 */
export function ImportFaturaDialog({ cardId, cardName }: { cardId: string; cardName: string }) {
  const [previewState, previewAction, previewPending] = useActionState<FaturaPreviewState, FormData>(
    previewFatura,
    {},
  );
  const [applyState, applyAction, applyPending] = useActionState<FaturaApplyState, FormData>(
    applyFatura,
    {},
  );
  useActionToast(applyState, { success: "Fatura importada." });

  const [open, setOpen] = useState(false);
  // Preview vira estado local editável assim que a action responde
  // (padrão "adjust state while rendering", como no PayCell).
  const [preview, setPreview] = useState<FaturaPreview | null>(null);
  const [seenPreview, setSeenPreview] = useState(previewState);
  if (previewState !== seenPreview) {
    setSeenPreview(previewState);
    if (previewState.preview) setPreview(previewState.preview);
  }
  const [seenApply, setSeenApply] = useState(applyState);
  if (applyState !== seenApply) {
    setSeenApply(applyState);
    if (applyState.ok) {
      setOpen(false);
      setPreview(null);
    }
  }

  const setDescription = (index: number, description: string) => {
    setPreview((p) =>
      p ? { ...p, lines: p.lines.map((l, i) => (i === index ? { ...l, description } : l)) } : p,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FileUp className="size-4" />
          Importar fatura
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar fatura · {cardName}</DialogTitle>
          <DialogDescription>
            Envie o PDF da fatura fechada (Nubank ou Bradesco). Nada é gravado até você confirmar o preview —
            e dá para renomear cada linha antes de importar.
          </DialogDescription>
        </DialogHeader>

        {preview === null ? (
          <form action={previewAction} className="flex flex-col gap-3">
            <input type="hidden" name="cardId" value={cardId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`fatura-file-${cardId}`}>PDF da fatura</Label>
              <Input id={`fatura-file-${cardId}`} type="file" name="file" accept="application/pdf" required />
            </div>
            {previewState.error && <p className="text-sm text-destructive">{previewState.error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={previewPending}>
                {previewPending ? "Lendo…" : "Ler fatura"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatCompetencia(monthToDate(preview.faturaMonth))}</Badge>
              <span className="font-semibold tabular-nums">{formatCents(preview.totalCents)}</span>
              <span className="text-muted-foreground">
                · {preview.lines.length} linhas · vence {shortDate(preview.dueDateISO)}
                {preview.limitCents !== null && ` · limite ${formatCents(preview.limitCents)}`}
              </span>
            </div>
            {preview.warnings.length > 0 && (
              <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
                {preview.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
            {preview.monthsImpact.length > 0 && (
              <div className="rounded-md border p-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Impacto por mês se você confirmar
                </p>
                <ul className="space-y-0.5 text-xs tabular-nums">
                  {preview.monthsImpact.map((m) => {
                    const diff = m.afterCents - m.beforeCents;
                    return (
                      <li key={m.month} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{formatCompetencia(monthToDate(m.month))}</span>
                        <span>
                          {formatCents(m.beforeCents)} → <strong>{formatCents(m.afterCents)}</strong>
                          {diff !== 0 && (
                            <span
                              className={cn(
                                "ml-1",
                                diff > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                              )}
                            >
                              ({diff > 0 ? "+" : ""}
                              {formatCents(diff)})
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  {preview.lines.map((line, i) => (
                    <tr key={i} className={cn("border-b last:border-b-0", line.kind === "payment" && "opacity-50")}>
                      <td className="whitespace-nowrap px-2 py-1 text-xs text-muted-foreground tabular-nums">
                        {shortDate(line.dateISO)}
                      </td>
                      <td className="w-full px-2 py-1">
                        {line.kind === "payment" ? (
                          <span className="text-xs line-through">{line.description} (não importa)</span>
                        ) : (
                          <Input
                            value={line.description}
                            onChange={(e) => setDescription(i, e.target.value)}
                            className="h-7 text-sm"
                            aria-label={`Descrição da linha ${i + 1}`}
                          />
                        )}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-2 py-1 text-right tabular-nums",
                          line.cents < 0 && "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {formatCents(line.cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={applyAction}>
              <input
                type="hidden"
                name="payload"
                value={JSON.stringify({
                  cardId: preview.cardId,
                  bank: preview.bank,
                  faturaMonth: preview.faturaMonth,
                  closingISO: preview.closingISO,
                  totalCents: preview.totalCents,
                  expectedLinesCents: preview.expectedLinesCents,
                  limitCents: preview.limitCents,
                  lines: preview.lines,
                })}
              />
              <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                  Voltar
                </Button>
                <Button type="submit" disabled={applyPending}>
                  {applyPending ? "Importando…" : "Importar fatura"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
