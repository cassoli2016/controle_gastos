import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: {
    value: "text-foreground",
    chip: "bg-primary/10 text-primary",
  },
  income: {
    value: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  expense: {
    value: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  warn: {
    value: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
} as const;

export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
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
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">
            {label}
          </div>
          {/* text-base no mobile: "R$ 25.000,00" cabe inteiro num card de meia largura */}
          <div className={cn("truncate text-base font-bold tabular-nums md:text-xl", t.value)}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
