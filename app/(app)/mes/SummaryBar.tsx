import { Money } from "@/components/Money";
import type { DueRow } from "@/lib/due-soon";
import { cn } from "@/lib/utils";

/**
 * Barra fixa no rodapé do celular, logo acima da navegação: o que falta pagar
 * e a próxima conta a vencer. A lista do Mês é longa, e os números ficavam
 * lá em cima — rolar até eles para saber "quanto falta" era o caminho de
 * sempre. No desktop os números já estão à vista.
 */
export function SummaryBar({ remainingCents, next }: { remainingCents: number; next: DueRow | null }) {
  return (
    <div
      className="fixed inset-x-0 z-10 border-t bg-background/95 px-4 py-2 text-xs backdrop-blur md:hidden"
      style={{ bottom: "calc(55px + env(safe-area-inset-bottom))" }}
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-muted-foreground">
          {remainingCents === 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Mês todo pago</span>
          ) : (
            <>
              Falta pagar <Money cents={remainingCents} className="font-semibold text-foreground" />
            </>
          )}
        </span>
        {next ? (
          <span className={cn("min-w-0 truncate", next.overdue ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
            {next.overdue ? "atrasada" : next.daysLeft === 0 ? "hoje" : `dia ${next.dueDay}`} · {next.itemName}{" "}
            <Money cents={next.cents} className={cn("font-medium", !next.overdue && "text-foreground")} />
          </span>
        ) : (
          remainingCents > 0 && <span className="text-muted-foreground">nada vencendo em breve</span>
        )}
      </div>
    </div>
  );
}
