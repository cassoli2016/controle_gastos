import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: {
    value: "text-foreground",
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  income: {
    value: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  expense: {
    value: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
  },
  warn: {
    value: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
} as const;

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  detail,
  progress,
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  /** Sub-linha explicativa abaixo do valor (ex.: "R$ 660,00 pago · R$ 490,00 falta"). */
  detail?: string;
  /** 0–100: barra fina de progresso na cor do tom. Ausente = sem barra. */
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-2.5 p-3 md:gap-3 md:p-4">
        {Icon && (
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg md:size-9", t.chip)}>
            <Icon className="size-4 md:size-4.5" />
          </div>
        )}
        {/* flex-1: o detalhe e a barra ocupam a largura toda do card */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {label}
          </div>
          {/* text-base no mobile: "R$ 25.000,00" cabe inteiro num card de meia largura */}
          <div className={cn("truncate text-base font-bold tabular-nums md:text-xl", t.value)}>{value}</div>
          {detail && (
            <div className="truncate text-[11px] text-muted-foreground md:text-xs">{detail}</div>
          )}
          {progress !== undefined && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", t.bar)}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
